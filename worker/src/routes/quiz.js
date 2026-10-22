import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { fail, areAllFriends } from "../db.js";
import { tmdb, soft, titleDetails, normType, tmdbType } from "../tmdb.js";

// Title quizzes: questions generated once (TMDB facts, plus an optional
// Claude-written plot round), stored, and shared so friends compete on the
// same set. Correct answers never leave the server until you've answered.
const quiz = new Hono();

// ------------------------------------------------------------- helpers

function randomInt(n) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newQuizId() {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

// Builds {options, answer} with the correct option at a random position.
function choices(correct, wrong) {
  const distinct = [...new Set(wrong.filter((w) => w && w !== correct))];
  if (distinct.length < 3) return null;
  const options = shuffle([correct, ...shuffle(distinct).slice(0, 3)]);
  return { options, answer: options.indexOf(correct) };
}

const FALLBACK_DIRECTORS = [
  "Christopher Nolan", "Steven Spielberg", "Denis Villeneuve", "Greta Gerwig", "Quentin Tarantino",
  "James Gunn", "Ridley Scott", "Martin Scorsese", "David Fincher", "Jordan Peele", "Ryan Coogler",
  "Taika Waititi", "Bong Joon Ho", "Patty Jenkins", "Sam Raimi", "Jon Favreau", "Guillermo del Toro",
  "James Cameron", "Kathryn Bigelow", "Russo Brothers",
];

const isRealCharacter = (ch) => ch && !/^(self|himself|herself|themselves|narrator)\b/i.test(ch) && ch.length < 60;

// "Murph (10 Yrs.)" -> "Murph", "TARS (voice)" -> "TARS".
const cleanCharacter = (ch) => String(ch || "").replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
const words = (s) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
const overlaps = (a, b) => [...words(a)].some((w) => words(b).has(w));

// Cast with unambiguous character names: no two people share a name word
// (young/old versions of a character, "Brand" vs "Professor Brand").
function quizCast(cast) {
  const people = cast
    .filter((p) => isRealCharacter(p.character))
    .map((p) => ({ ...p, character: cleanCharacter(p.character) }))
    .filter((p) => p.character);
  return people.filter((p) => !people.some((o) => o !== p && overlaps(o.character, p.character)));
}

// ------------------------------------------------------- TMDB questions

async function tmdbQuestions(env, d) {
  const series = d.media_type === "series";
  const cast = quizCast(d.cast || []);
  const castNames = new Set((d.cast || []).map((p) => p.name));

  // Casts and directors of similar titles make believable wrong answers.
  const similar = (d.more_like_this || []).slice(0, 3);
  const credits = await Promise.all(
    similar.map((m) => soft(tmdb(env, `/${tmdbType(m.media_type)}/${m.tmdb_id}/credits`, {}, 86400 * 7), null))
  );
  const otherActors = credits.flatMap((cr) => (cr?.cast || []).slice(0, 8).map((p) => p.name)).filter((n) => !castNames.has(n));
  const otherDirectors = credits.flatMap((cr) => (cr?.crew || []).filter((p) => p.job === "Director").map((p) => p.name));

  const qs = [];

  for (const p of shuffle(cast).slice(0, 4)) {
    const c = choices(p.name, cast.map((x) => x.name));
    if (c) qs.push({ kind: "cast", question: `Who plays ${p.character} in ${d.title}?`, ...c });
  }

  for (const p of shuffle(cast).slice(0, 2)) {
    const c = choices(p.character, cast.map((x) => x.character));
    if (c) qs.push({ kind: "character", question: `Which character does ${p.name} play?`, ...c });
  }

  if (d.directors?.length) {
    const correct = d.directors[0];
    const wrong = [...shuffle(otherDirectors), ...shuffle(FALLBACK_DIRECTORS)].filter((n) => !d.directors.includes(n));
    const c = choices(correct, wrong);
    if (c) qs.push({ kind: "director", question: series ? `Who created ${d.title}?` : `Who directed ${d.title}?`, ...c });
  }

  const year = Number(String(d.release_date || "").slice(0, 4));
  if (year) {
    const wrong = shuffle([-4, -3, -2, -1, 1, 2, 3]).map((delta) => String(year + delta));
    const c = choices(String(year), wrong);
    if (c) qs.push({ kind: "year", question: series ? `What year did ${d.title} premiere?` : `What year was ${d.title} released?`, ...c });
  }

  if (series && d.seasons >= 2) {
    const n = d.seasons;
    const c = choices(String(n), [n - 2, n - 1, n + 1, n + 2].filter((x) => x >= 1).map(String));
    if (c) qs.push({ kind: "seasons", question: `How many seasons of ${d.title} are there so far?`, ...c });
  }

  if (otherActors.length && cast.length >= 3) {
    const impostor = shuffle(otherActors)[0];
    const real = shuffle(cast).slice(0, 3).map((p) => p.name);
    const options = shuffle([impostor, ...real]);
    qs.push({ kind: "impostor", question: `Which of these actors is NOT in ${d.title}?`, options, answer: options.indexOf(impostor) });
  }

  return shuffle(qs).slice(0, 8);
}

// --------------------------------------------------------- AI questions

const AiQuiz = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()),
      correct_index: z.number().int(),
      explanation: z.string(),
    })
  ),
});

async function aiQuestions(env, d) {
  if (!env.ANTHROPIC_API_KEY) return [];
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 90_000, maxRetries: 1 });
  const kind = d.media_type === "series" ? "TV series" : "film";
  const castList = (d.cast || []).slice(0, 10).map((p) => `${p.name} as ${p.character || "?"}`).join("; ");

  const response = await client.messages.parse(
    {
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium", format: zodOutputFormat(AiQuiz) },
      // Server-side fallback: if a safety classifier declines, Anthropic
      // re-runs the request on its recommended fallback model.
      fallbacks: "default",
      messages: [
        {
          role: "user",
          content: `Write a fun 5-question multiple-choice trivia round for fans who have already watched the ${kind} "${d.title}" (${d.year || "year unknown"}).

Synopsis: ${d.overview || "n/a"}
Main cast: ${castList || "n/a"}

The round sits after a separate round that already covers cast, characters, director and release year, so focus on plot events, memorable scenes, relationships, quotes and behind-the-scenes facts. Only ask about things you are confident are accurate for this exact title; skip anything you're unsure of rather than guessing. Each question has exactly 4 short options with one correct answer (correct_index is 0-3), plausible wrong answers, and a one-sentence explanation shown after answering. Spoilers are fine.`,
        },
      ],
    },
    { headers: { "anthropic-beta": "server-side-fallback-2026-07-01" } }
  );

  if (response.stop_reason === "refusal" || !response.parsed_output) return [];
  return response.parsed_output.questions
    .filter(
      (q) =>
        q.question &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        new Set(q.options).size === 4 &&
        Number.isInteger(q.correct_index) &&
        q.correct_index >= 0 &&
        q.correct_index < 4
    )
    .slice(0, 5)
    .map((q) => ({ kind: "ai", question: q.question, options: q.options, answer: q.correct_index, explain: q.explanation || null }));
}

// ------------------------------------------------------------- shaping

const publicQuestion = (q) => ({ kind: q.kind, question: q.question, options: q.options });
const revealedQuestion = (q) => ({ ...publicQuestion(q), answer: q.answer, explain: q.explain || null });

function quizSummary(row) {
  return {
    id: row.id,
    tmdb_id: row.tmdb_id,
    media_type: normType(row.media_type),
    title: row.title,
    poster: row.poster || null,
    backdrop: row.backdrop || null,
    has_ai: !!row.has_ai,
    created_at: row.created_at,
    creator_id: row.creator_id,
    creator_username: row.creator_username,
    creator_display_name: row.creator_display_name,
  };
}

const QUIZ_SQL = `
  SELECT q.*, u.username AS creator_username, u.display_name AS creator_display_name
  FROM quizzes q JOIN users u ON u.id = q.creator_id WHERE q.id = ?1`;

// Scores from you, your friends and the quiz creator.
const BOARD_SQL = `
  SELECT a.user_id, a.score, a.total, a.created_at, u.username, u.display_name
  FROM quiz_attempts a JOIN users u ON u.id = a.user_id
  WHERE a.quiz_id = ?1 AND (a.user_id = ?2 OR a.user_id = ?3 OR a.user_id IN (
    SELECT CASE WHEN f.requester_id = ?2 THEN f.addressee_id ELSE f.requester_id END
    FROM friendships f WHERE f.status = 'accepted' AND (f.requester_id = ?2 OR f.addressee_id = ?2)))
  ORDER BY a.score * 1.0 / a.total DESC, a.created_at ASC`;

async function loadQuiz(c, id) {
  const row = await c.env.DB.prepare(QUIZ_SQL).bind(id).first();
  if (!row) throw fail(404, "Quiz not found");
  return row;
}

async function quizView(c, row) {
  const db = c.env.DB;
  const userId = c.get("userId");
  const [mine, board] = await db.batch([
    db.prepare("SELECT * FROM quiz_attempts WHERE quiz_id = ?1 AND user_id = ?2").bind(row.id, userId),
    db.prepare(BOARD_SQL).bind(row.id, userId, row.creator_id),
  ]);
  const attempt = mine.results[0] || null;
  const questions = JSON.parse(row.questions);
  return {
    quiz: quizSummary(row),
    questions: attempt ? questions.map(revealedQuestion) : questions.map(publicQuestion),
    attempt: attempt
      ? { score: attempt.score, total: attempt.total, answers: JSON.parse(attempt.answers), created_at: attempt.created_at }
      : null,
    leaderboard: board.results,
  };
}

// --------------------------------------------------------------- routes

quiz.post("/quizzes", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const db = c.env.DB;
  const userId = c.get("userId");
  const tmdbId = Number(body.tmdb_id);
  const mediaType = normType(body.media_type);
  if (!Number.isInteger(tmdbId)) throw fail(400, "Bad title id");

  const watched = await db
    .prepare("SELECT 1 FROM movies WHERE user_id = ? AND tmdb_id = ? AND media_type = ? AND is_watched = 1")
    .bind(userId, tmdbId, mediaType)
    .first();
  if (!watched) throw fail(400, "Mark it as watched first — quizzes are for titles you've seen");

  const d = await titleDetails(c.env, mediaType, tmdbId).catch(() => null);
  if (!d) throw fail(404, "Couldn't find that title");

  const [facts, ai] = await Promise.all([
    tmdbQuestions(c.env, d),
    body.ai ? aiQuestions(c.env, d).catch((err) => (console.error("AI quiz round failed", err), [])) : [],
  ]);
  const questions = [...facts, ...ai];
  if (facts.length < 4) throw fail(400, "There isn't enough info about this title to build a quiz");

  const id = newQuizId();
  await db
    .prepare(
      `INSERT INTO quizzes (id, creator_id, tmdb_id, media_type, title, poster, backdrop, questions, has_ai)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, userId, d.tmdb_id, d.media_type, d.title, d.poster, d.backdrop, JSON.stringify(questions), ai.length ? 1 : 0)
    .run();
  return c.json({ id, questions: questions.length, ai_questions: ai.length, ai_available: !!c.env.ANTHROPIC_API_KEY });
});

quiz.get("/quizzes", async (c) => {
  const db = c.env.DB;
  const userId = c.get("userId");
  const [created, taken, invites] = await db.batch([
    db.prepare(
      `SELECT q.id, q.tmdb_id, q.media_type, q.title, q.poster, q.backdrop, q.has_ai, q.created_at, q.creator_id,
         (SELECT COUNT(*) FROM quiz_attempts a WHERE a.quiz_id = q.id) AS players,
         (SELECT score FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.user_id = ?1) AS my_score,
         (SELECT total FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.user_id = ?1) AS my_total
       FROM quizzes q WHERE q.creator_id = ?1 ORDER BY q.created_at DESC LIMIT 50`
    ).bind(userId),
    db.prepare(
      `SELECT q.id, q.tmdb_id, q.media_type, q.title, q.poster, q.has_ai, a.score AS my_score, a.total AS my_total,
         a.created_at, u.username AS creator_username, u.display_name AS creator_display_name
       FROM quiz_attempts a JOIN quizzes q ON q.id = a.quiz_id JOIN users u ON u.id = q.creator_id
       WHERE a.user_id = ?1 AND q.creator_id != ?1 ORDER BY a.created_at DESC LIMIT 50`
    ).bind(userId),
    db.prepare(INVITES_SQL).bind(userId),
  ]);
  return c.json({ created: created.results, taken: taken.results, invites: invites.results });
});

export const INVITES_SQL = `
  SELECT i.id, i.quiz_id, i.created_at, q.title, q.poster, q.media_type, q.has_ai,
    u.username AS sender_username, u.display_name AS sender_display_name
  FROM quiz_invites i JOIN quizzes q ON q.id = i.quiz_id JOIN users u ON u.id = i.sender_id
  WHERE i.recipient_id = ?1 AND i.status = 'pending'
  ORDER BY i.created_at DESC`;

quiz.get("/quizzes/:id", async (c) => c.json(await quizView(c, await loadQuiz(c, c.req.param("id")))));

quiz.post("/quizzes/:id/attempts", async (c) => {
  const row = await loadQuiz(c, c.req.param("id"));
  const db = c.env.DB;
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  const questions = JSON.parse(row.questions);
  const answers = questions.map((_, i) => {
    const a = Number([].concat(body.answers || [])[i]);
    return Number.isInteger(a) && a >= 0 && a < 4 ? a : -1;
  });
  const score = questions.reduce((s, q, i) => s + (q.answer === answers[i] ? 1 : 0), 0);

  // First attempt wins; a retake just returns the original result.
  await db.batch([
    db
      .prepare(
        `INSERT INTO quiz_attempts (quiz_id, user_id, score, total, answers) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (quiz_id, user_id) DO NOTHING`
      )
      .bind(row.id, userId, score, questions.length, JSON.stringify(answers)),
    db.prepare("UPDATE quiz_invites SET status = 'done' WHERE quiz_id = ?1 AND recipient_id = ?2").bind(row.id, userId),
  ]);
  return c.json(await quizView(c, row));
});

quiz.post("/quizzes/:id/invite", async (c) => {
  const row = await loadQuiz(c, c.req.param("id"));
  const db = c.env.DB;
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  const friendIds = [...new Set([].concat(body.friend_user_ids || []).map(Number))].filter(Number.isInteger);
  if (!friendIds.length) throw fail(400, "Pick at least one friend");
  if (!(await areAllFriends(db, userId, friendIds))) throw fail(400, "You can only challenge accepted friends");
  await db.batch(
    friendIds.map((fid) =>
      db
        .prepare(
          `INSERT INTO quiz_invites (quiz_id, sender_id, recipient_id) VALUES (?1, ?2, ?3)
           ON CONFLICT (quiz_id, recipient_id) DO NOTHING`
        )
        .bind(row.id, userId, fid)
    )
  );
  return c.json({ message: "invited", count: friendIds.length });
});

quiz.post("/quiz-invites/:id/dismiss", async (c) => {
  await c.env.DB.prepare("UPDATE quiz_invites SET status = 'dismissed' WHERE id = ? AND recipient_id = ?")
    .bind(Number(c.req.param("id")), c.get("userId"))
    .run();
  return c.json({ message: "dismissed" });
});

export default quiz;
