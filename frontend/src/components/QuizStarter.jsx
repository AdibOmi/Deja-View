import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "./Icon";
import { api } from "../api";
import { useToast } from "../context/ToastContext";

// "Quiz me on this" with an optional AI-written plot round. Creating a quiz
// takes a few seconds (longer with the AI round), then opens it.
function QuizStarter({ title, onStarted, compact = false }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [ai, setAi] = useState(true);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const res = await api.createQuiz(title, ai);
      if (ai && !res.ai_available) showToast("The AI round isn't set up yet, so this quiz uses movie-database questions only", "info");
      else if (ai && res.ai_questions === 0) showToast("Couldn't write an AI round this time, so this quiz uses movie-database questions only", "info");
      onStarted?.();
      navigate(`/quiz/${res.id}`);
    } catch (err) {
      showToast(err.message, "error");
      setBusy(false);
    }
  }

  return (
    <div className={`quizStarter${compact ? " quizStarter--compact" : ""}`}>
      <label className="checkRow">
        <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} disabled={busy} />
        <span>
          Add an AI plot round <span className="muted small">(5 extra questions about scenes and story)</span>
        </span>
      </label>
      <button className="btn btn--primary btn--sm" onClick={start} disabled={busy}>
        <Icon name="trophy" size={14} /> {busy ? (ai ? "Writing your quiz…" : "Building your quiz…") : "Start quiz"}
      </button>
    </div>
  );
}

export default QuizStarter;
