from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

app = FastAPI(title="Shift Scheduler optimization API")

# Configure CORS to allow communication from the Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production if needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SolveRequest(BaseModel):
    yearMonth: Optional[str] = None
    daysInMonth: int
    staff: List[Dict[str, Any]]
    routes: List[Dict[str, Any]]
    daySettings: Optional[Dict[str, Any]] = {}
    currentSchedule: Dict[str, Any]
    dateLabels: Dict[str, Any] = {}
    flatMode: Optional[bool] = False

@app.get("/health")
def health_check():
    return {"status": "ok", "message": "Solver API is running"}

from model import run_optimization

@app.post("/solve")
def solve_schedule(request: SolveRequest):
    try:
        # Convert Pydantic request to dict
        data = request.dict()
        result = run_optimization(data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
