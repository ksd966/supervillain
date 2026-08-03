# The Google Maps source needs a real browser; the OpenStreetMap source does
# not. Since the source is an input, the browser has to be present at runtime.
FROM apify/actor-node-playwright-chrome:22

COPY --chown=myuser package*.json ./

RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version

COPY --chown=myuser . ./

CMD ["npm", "start", "--silent"]
