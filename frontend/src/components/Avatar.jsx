const GRADIENTS = [
  ["#E50914", "#FF8A8F"],
  ["#5C8AC4", "#5CC4B8"],
  ["#FF8A8F", "#5C8AC4"],
  ["#5CC4B8", "#E50914"],
  ["#E50914", "#5C8AC4"],
  ["#FF8A8F", "#E50914"],
];

function initialsFor(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function gradientFor(name) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const [a, b] = GRADIENTS[Math.abs(hash) % GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

function Avatar({ name, size = 36 }) {
  const label = name || "?";
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, background: gradientFor(label), fontSize: Math.max(10, size * 0.38) }}
    >
      {initialsFor(label)}
    </span>
  );
}

export default Avatar;
