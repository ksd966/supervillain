# The Playwright image is used even though most runs will pick the Cheerio
# crawler — the crawler type is an input, so the browser has to be available at
# runtime. Swap to `apify/actor-node:22` for a much smaller image if you know
# you will never need JavaScript rendering.
FROM apify/actor-node-playwright-chrome:22

# Dependencies are installed first so Docker can cache the layer across builds
# that only touch source files.
COPY --chown=myuser package*.json ./

RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

COPY --chown=myuser . ./

CMD ["npm", "start", "--silent"]
