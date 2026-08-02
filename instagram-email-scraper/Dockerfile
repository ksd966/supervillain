# No browser needed — this actor talks to Instagram's JSON endpoint and to
# ordinary websites over HTTP, so the small Node image is enough.
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
