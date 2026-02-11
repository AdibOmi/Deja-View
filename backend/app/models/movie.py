from sqlalchemy import Column, Integer, String
from app.db.db import Base

class Movie(Base):
    __tablename__ = "movies"
    id = Column(Integer, primary_key=True, index=True)
    imdb_id = Column(String, unique=True, index=True, nullable=False)
    title=Column(String, nullable=False)
    poster=Column(String, nullable=True)