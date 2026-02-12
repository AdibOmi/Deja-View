#schemas define how data enters/leaves API

from pydantic import BaseModel
#parent class for all schemas
from typing import Optional
#without Optional, fields cannot be Null


class MovieCreate(BaseModel):
    imbd_id: str
    title: str
    poster: Optional[str]=None

#used when data is sent to backend e.g. Post/save

class MovieOut(BaseModel):
    id: int
    imdb_id: str
    title: str
    poster: Optional[str]=None

    #backend returns movie data

    class Config:
        from_attributes=True
    #allows pydantic to convert sqlalchemy object to json


