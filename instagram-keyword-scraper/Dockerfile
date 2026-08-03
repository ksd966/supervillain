# No browser needed: this actor talks to a search engine's HTML endpoint and
# reads the bio out of the result snippet. Instagram is never contacted.
FROM apify/actor-node:22

COPY --chown=myuser package*.json ./

RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version

COPY --chown=myuser . ./

CMD ["npm", "start", "--silent"]
