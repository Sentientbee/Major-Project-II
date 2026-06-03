from fastapi import FastAPI

app = FastAPI(title="AI Engine API")

@app.get("/")
def read_root():
    return {"status": "success", "message": "Hello World from FastAPI ML Engine!"}