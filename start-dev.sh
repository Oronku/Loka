#!/bin/bash

# Start backend and frontend in development mode
echo "Starting Meet Loca development servers..."

# Start backend
echo "Starting backend on port 3001..."
cd backend && npm run dev &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Start frontend
echo "Starting frontend on port 5190..."
cd frontend-v2 && npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Servers started:"
echo "   - Backend: http://localhost:3001"
echo "   - Frontend: http://localhost:5190"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
