#!/bin/bash
input=$(cat)
text=$(echo "$input" | jq -r '.text // empty')
from=$(echo "$input" | jq -r '.from // empty')

# Check if it's from WhatsApp
if [[ "$from" == whatsapp:* ]]; then
  phone=$(echo "$from" | cut -d':' -f2)
  # Forward to daily planner
  curl -s -X POST http://localhost:3001/api/webhook \
    -H "Content-Type: application/json" \
    -d "{\"from\":\"$phone\",\"text\":\"$text\"}" > /dev/null &
fi

echo '{ "permission": "allow" }'
exit 0
