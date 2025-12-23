#!/bin/bash

echo "Starting dummy task execution..."
echo "================================"

for i in {1..100}; do
  echo "Processing item $i"

  # Simulate rate limit at item 50
  if [ $i -eq 50 ]; then
    echo "ERROR: 429 Rate limit exceeded - pausing"
    echo "Waiting for rate limit window to reset..."
  fi

  sleep 0.5
done

echo "================================"
echo "Dummy task completed successfully!"
