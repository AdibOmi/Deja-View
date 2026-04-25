import { useState } from "react";

export default function RateCommentModal({ movie, onClose, onSave }) {
  const [rating, setRating] = useState(movie?.my_rating || "");
  const [comment, setComment] = useState(movie?.my_comment || "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onSave({
        my_rating: rating === "" ? null : Number(rating),
        my_comment: comment,
      });
      onClose();
    } catch (error) {
      alert("Failed to save rating/comment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2>Rate & Comment</h2>
        <p><strong>{movie.title}</strong></p>

        <label style={styles.label}>Rating (1-10)</label>
        <input
          type="number"
          min="1"
          max="10"
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          style={styles.input}
        />

        <label style={styles.label}>Comment</label>
        <textarea
          rows="4"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          style={styles.textarea}
        />

        <div style={styles.actions}>
          <button onClick={onClose} style={styles.cancelBtn}>Cancel</button>
          <button onClick={handleSubmit} style={styles.saveBtn} disabled={loading}>
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "16px",
  },
  modal: {
    background: "white",
    padding: "20px",
    borderRadius: "12px",
    width: "100%",
    maxWidth: "500px",
  },
  label: {
    display: "block",
    marginTop: "12px",
    marginBottom: "6px",
    fontWeight: "bold",
  },
  input: {
    width: "100%",
    padding: "10px",
    fontSize: "16px",
  },
  textarea: {
    width: "100%",
    padding: "10px",
    fontSize: "16px",
    resize: "vertical",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "16px",
  },
  cancelBtn: {
    padding: "10px 14px",
    cursor: "pointer",
  },
  saveBtn: {
    padding: "10px 14px",
    cursor: "pointer",
  },
};