// Arma un sitio estático por cliente: dist/<slug>/ = src/ + tenants/<slug>/.
// Cada cliente se despliega por separado, así el build de un cliente nunca
// contiene datos de otro. Uso: `node build.mjs` (todos) o `node build.mjs demo`.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REQUIRED = ['slug', 'clientName', 'shortName', 'ownInmobiliarias', 'brandColor', 'storagePrefix'];

function build(slug) {
  const tenantDir = join('tenants', slug);
  const tenant = JSON.parse(readFileSync(join(tenantDir, 'tenant.json'), 'utf8'));
  const missing = REQUIRED.filter((k) => tenant[k] === undefined);
  if (missing.length) throw new Error(`tenants/${slug}/tenant.json: faltan ${missing.join(', ')}`);
  if (tenant.slug !== slug) throw new Error(`tenants/${slug}/tenant.json: slug "${tenant.slug}" no calza con la carpeta`);

  const out = join('dist', slug);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync('src', out, { recursive: true });
  // lo del cliente pisa lo común (data/, y opcionalmente assets/ propios)
  for (const entry of readdirSync(tenantDir)) {
    if (entry !== 'tenant.json') cpSync(join(tenantDir, entry), join(out, entry), { recursive: true });
  }
  writeFileSync(join(out, 'tenant.js'), `window.TENANT = ${JSON.stringify(tenant, null, 2)};\n`);

  const vars = { ...tenant, brandInitial: tenant.shortName[0] };
  for (const page of ['index.html', 'admin.html']) {
    const file = join(out, page);
    const html = readFileSync(file, 'utf8').replace(/\{\{(\w+)\}\}/g, (m, key) => {
      if (vars[key] === undefined) throw new Error(`${page}: placeholder desconocido ${m}`);
      return vars[key];
    });
    writeFileSync(file, html);
  }
  console.log(`✓ dist/${slug}`);
}

const slugs = process.argv.slice(2);
const all = readdirSync('tenants').filter((d) => existsSync(join('tenants', d, 'tenant.json')));
for (const s of slugs.length ? slugs : all) build(s);
