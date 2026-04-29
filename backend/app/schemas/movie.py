#schemas define how data enters/leaves API

from pydantic import BaseModel
#parent class for all schemas
from typing import Optional
#without Optional, fields cannot be Null


class MovieCreate(BaseModel):
    imdb_id: str
    title: str
    poster: Optional[str]=None
    imdb_rating: Optional[str] = None

#used when data is sent to backend e.g. Post/save

class MovieOut(BaseModel):
    id: int
    imdb_id: str
    title: str
    poster: Optional[str]=None
    imdb_rating: Optional[str] = None


class MovieUpdate(BaseModel):
    my_rating: int | None = None
    my_comment: str | None = None



    #backend returns movie data

    class Config:
        from_attributes=True
    #allows pydantic to convert sqlalchemy object to json


