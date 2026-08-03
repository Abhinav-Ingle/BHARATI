# 1. Use a lightweight Python base image
FROM python:3.11-slim

# 2. Install system dependencies required by OpenCV and YOLO
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libxcb1 \
    && rm -rf /var/lib/apt/lists/*

# 3. Create the specific UID (1000)
RUN useradd -m -u 1000 user

# 4. Switch to the new user
USER user

# 5. Set up the environment paths
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# 6. Set the working directory
WORKDIR $HOME/app

# 7. Copy dependencies first to leverage Docker caching
COPY --chown=user requirements.txt .

# 8. Install dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 9. Copy the rest of the application code
COPY --chown=user . .

# 10. Expose the port
EXPOSE 7860

# 11. Launch the FastAPI server using Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]