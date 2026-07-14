from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.db.db import Base


class SharedMovie(Base):
    __tablename__ = "shared_movies"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    imdb_id = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    poster = Column(String, nullable=True)
    imdb_rating = Column(String, nullable=True)
    media_type = Column(String, nullable=True)

    comment = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="pending")  # pending | added | dismissed
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    sender = relationship("User", foreign_keys=[sender_id])
    receiver = relationship("User", foreign_keys=[receiver_id])
