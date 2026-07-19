# OBTO MCP bootstrap server — stdio, zero dependencies.
# The full OBTO platform is a hosted remote MCP server (OAuth) at
# https://app.obto.co/ms/mcp; this container is the unauthenticated
# introspectable front door for directory checks and first contact.
FROM node:22-alpine

WORKDIR /app
COPY server.js ./

# No npm install — the server has zero dependencies.
CMD ["node", "server.js"]
