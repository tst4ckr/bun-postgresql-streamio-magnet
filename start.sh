#!/bin/sh

# Start tor in the background
tor -f /etc/tor/torrc &

# Wait for tor to initialize
sleep 5

# Start the bun application
exec bun run start:prod