from sqlalchemy import Column, Integer, String, Text
from app.db.db import Base

class Movie(Base):
    __tablename__ = "movies"
    id = Column(Integer, primary_key=True, index=True)
    imdb_id = Column(String, unique=True, index=True, nullable=False)
    title=Column(String, nullable=False)
    poster=Column(String, nullable=True)

    year=Column(String, nullable=True)
    runtime=Column(String, nullable=True)
    genre=Column(String, nullable=True)
    director=Column(String, nullable=True)
    actors=Column(String, nullable=True)
    imdb_rating=Column(String, nullable=True)
    plot=Column(Text, nullable=True)
    
    my_rating = Column(Integer, nullable=True)
    my_comment = Column(Text, nullable=True)