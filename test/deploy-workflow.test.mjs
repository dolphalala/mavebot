import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

for (const scriptName of ['poll-deploy.sh', 'deploy-server.sh']) {
  test(`${scriptName} rejects direct edits to the production checkout`, async () => {
    const source = await readFile(new URL(`../scripts/${scriptName}`, import.meta.url), 'utf8');
    const dirtyCheckIndex = source.indexOf('status --porcelain --untracked-files=normal');
    const fetchIndex = source.indexOf('fetch origin');

    assert.ok(dirtyCheckIndex >= 0, `${scriptName} does not inspect the working tree`);
    assert.ok(fetchIndex > dirtyCheckIndex, `${scriptName} fetches before checking for direct edits`);
    assert.match(source, /refusing (?:poll )?deploy because the production checkout has uncommitted changes/);
    assert.match(source, /Edit a local clone, commit the change, and push origin\/\$BRANCH/);
  });
}
