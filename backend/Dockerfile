# 1. Use a lightweight Python base image
FROM python:3.11-slim

# 2. Create the specific UID (1000) that Hugging Face Spaces requires
RUN useradd -m -u 1000 user

# 3. Switch to the new user
USER user

# 4. Set up the environment paths
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# 5. Set the working directory
WORKDIR $HOME/app

# 6. Copy dependencies first to leverage Docker caching
COPY --chown=user requirements.txt .

# 7. Install dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 8. Copy the rest of the application code
COPY --chown=user . .

# 9. Expose the mandatory Hugging Face port
EXPOSE 7860

# 10. Launch the FastAPI server using Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]