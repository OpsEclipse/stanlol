#!/bin/bash
# Install dependencies
npm install  # or pip install -r requirements.txt

# Set environment
export NODE_ENV=development

# Run baseline test to confirm clean state
npm test

# Print current task status
cat feature-list.json | jq '.features[] | select(.status == "pending") | .name' | head -5
