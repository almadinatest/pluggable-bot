import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings } from './types.js';
import { chatRoute } from './chat.js';
import { trainRoute } from './train.js';
import { getChunkCount } from './knowledge.js';

const app = new Hono<{ Bindings: Bindings }>();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use('*', cors());

// ── Routes ────────────────────────────────────────────────────────────────────
chatRoute(app);
trainRoute(app);

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', chunks: getChunkCount() });
});

// Serve the compiled widget JS (injected at build time via wrangler text_blobs)
app.get('/widget/pluggable-bot.js', (c) => {
  const js = c.env?.WIDGET_JS ?? '';
  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
});

// Demo index page
const DEMO_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Acme Analytics — Pluggable Bot Demo</title>
  <style>
    :root {
      --primary: #4f46e5;
      --primary-dark: #4338ca;
      --text: #111827;
      --muted: #6b7280;
      --bg: #f9fafb;
      --card: #ffffff;
      --border: #e5e7eb;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
    a { color: var(--primary); text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Nav */
    nav { background: var(--card); border-bottom: 1px solid var(--border); padding: 0 2rem; display: flex; align-items: center; justify-content: space-between; height: 64px; position: sticky; top: 0; z-index: 100; }
    nav .logo { font-size: 1.25rem; font-weight: 700; color: var(--primary); }
    nav ul { list-style: none; display: flex; gap: 2rem; }
    nav ul a { color: var(--text); font-weight: 500; }

    /* Train button */
    .train-btn { position: fixed; top: 1rem; right: 1rem; z-index: 9999; background: var(--primary); color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-size: 0.875rem; font-weight: 600; box-shadow: 0 2px 8px rgba(79,70,229,0.4); }
    .train-btn:hover { background: var(--primary-dark); }

    /* Hero */
    .hero { background: linear-gradient(135deg, var(--primary) 0%, #7c3aed 100%); color: #fff; text-align: center; padding: 6rem 2rem 5rem; }
    .hero h1 { font-size: 3rem; font-weight: 800; margin-bottom: 1rem; }
    .hero p { font-size: 1.25rem; opacity: .9; max-width: 600px; margin: 0 auto 2rem; }
    .hero .cta { background: #fff; color: var(--primary); padding: 0.8rem 2rem; border-radius: 8px; font-weight: 700; font-size: 1rem; display: inline-block; }
    .hero .cta:hover { background: #f0f0ff; }

    /* Sections */
    section { max-width: 1100px; margin: 0 auto; padding: 4rem 2rem; }
    h2 { font-size: 2rem; font-weight: 700; margin-bottom: 1rem; }
    .subtitle { color: var(--muted); margin-bottom: 2.5rem; }

    /* Features */
    .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
    .feature-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; }
    .feature-card .icon { font-size: 2rem; margin-bottom: 0.75rem; }
    .feature-card h3 { font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem; }
    .feature-card p { color: var(--muted); font-size: 0.9rem; }

    /* Pricing */
    .pricing { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.5rem; }
    .plan { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 2rem; text-align: center; }
    .plan.featured { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary); }
    .plan .price { font-size: 2.5rem; font-weight: 800; margin: 0.5rem 0; }
    .plan .price span { font-size: 1rem; font-weight: 400; color: var(--muted); }
    .plan ul { list-style: none; margin: 1.5rem 0; text-align: left; }
    .plan ul li { padding: 0.35rem 0; color: var(--muted); font-size: 0.9rem; }
    .plan ul li::before { content: "✓ "; color: var(--primary); font-weight: 700; }
    .plan .btn { display: block; background: var(--primary); color: #fff; padding: 0.7rem; border-radius: 6px; font-weight: 600; margin-top: 1rem; }
    .plan.featured .btn { background: var(--primary-dark); }

    /* FAQ */
    .faq-item { border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem 1.5rem; margin-bottom: 1rem; background: var(--card); }
    .faq-item h3 { font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem; }
    .faq-item p { color: var(--muted); font-size: 0.9rem; }

    /* Contact */
    .contact-form { max-width: 520px; }
    .contact-form label { display: block; font-weight: 500; margin-bottom: 0.25rem; }
    .contact-form input, .contact-form textarea { width: 100%; border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem 0.75rem; font-size: 0.9rem; margin-bottom: 1rem; font-family: inherit; }
    .contact-form button { background: var(--primary); color: #fff; border: none; padding: 0.7rem 2rem; border-radius: 6px; font-weight: 600; cursor: pointer; }

    footer { background: var(--card); border-top: 1px solid var(--border); text-align: center; padding: 2rem; color: var(--muted); font-size: 0.875rem; }
  </style>
</head>
<body>

<button class="train-btn" onclick="trainBot()">🤖 Train Bot on This Page</button>

<nav>
  <span class="logo">Acme Analytics</span>
  <ul>
    <li><a href="#features">Features</a></li>
    <li><a href="#pricing">Pricing</a></li>
    <li><a href="#faq">FAQ</a></li>
    <li><a href="#contact">Contact</a></li>
  </ul>
</nav>

<div class="hero">
  <h1>Understand Your Data. Instantly.</h1>
  <p>Acme Analytics gives your team real-time dashboards, AI-powered insights, and one-click reports — no data engineering required.</p>
  <a class="cta" href="#pricing">Start for free →</a>
</div>

<section id="features">
  <h2>Everything your team needs</h2>
  <p class="subtitle">Built for modern SaaS teams that want clarity without complexity.</p>
  <div class="features">
    <div class="feature-card">
      <div class="icon">📊</div>
      <h3>Real-time Dashboards</h3>
      <p>Monitor KPIs live. Drag-and-drop widgets, 40+ chart types, and smart anomaly alerts keep you ahead of issues.</p>
    </div>
    <div class="feature-card">
      <div class="icon">🤖</div>
      <h3>AI-Powered Insights</h3>
      <p>Ask questions in plain English. Our AI surfaces trends, anomalies, and recommendations automatically every morning.</p>
    </div>
    <div class="feature-card">
      <div class="icon">🔗</div>
      <h3>100+ Integrations</h3>
      <p>Connect Salesforce, HubSpot, Stripe, BigQuery, PostgreSQL, and more in minutes — no code required.</p>
    </div>
    <div class="feature-card">
      <div class="icon">🔒</div>
      <h3>Enterprise Security</h3>
      <p>SOC 2 Type II certified, SSO, role-based access controls, and data residency options for regulated industries.</p>
    </div>
    <div class="feature-card">
      <div class="icon">📈</div>
      <h3>Predictive Analytics</h3>
      <p>Forecast churn, revenue, and engagement using battle-tested ML models trained on your historical data.</p>
    </div>
    <div class="feature-card">
      <div class="icon">📤</div>
      <h3>One-click Reports</h3>
      <p>Schedule and share branded PDF/Excel reports with any stakeholder, automatically, on any cadence you choose.</p>
    </div>
  </div>
</section>

<section id="pricing" style="background: var(--card); max-width: 100%; padding: 4rem 2rem;">
  <div style="max-width: 1100px; margin: 0 auto;">
    <h2>Simple, transparent pricing</h2>
    <p class="subtitle">No hidden fees. Cancel anytime. All plans include a 14-day free trial.</p>
    <div class="pricing">
      <div class="plan">
        <h3>Free</h3>
        <div class="price">$0 <span>/ mo</span></div>
        <ul>
          <li>Up to 3 dashboards</li>
          <li>5 data connectors</li>
          <li>1 user seat</li>
          <li>Community support</li>
          <li>7-day data history</li>
        </ul>
        <a class="btn" href="#contact">Get started</a>
      </div>
      <div class="plan featured">
        <h3>Pro ⭐</h3>
        <div class="price">$29 <span>/ mo</span></div>
        <ul>
          <li>Unlimited dashboards</li>
          <li>50 data connectors</li>
          <li>5 user seats</li>
          <li>Email &amp; chat support</li>
          <li>1-year data history</li>
          <li>AI insights included</li>
        </ul>
        <a class="btn" href="#contact">Start free trial</a>
      </div>
      <div class="plan">
        <h3>Enterprise</h3>
        <div class="price">$99 <span>/ mo</span></div>
        <ul>
          <li>Everything in Pro</li>
          <li>Unlimited connectors</li>
          <li>Unlimited seats</li>
          <li>Dedicated support</li>
          <li>Unlimited history</li>
          <li>SSO &amp; audit logs</li>
          <li>Custom SLA</li>
        </ul>
        <a class="btn" href="#contact">Contact sales</a>
      </div>
    </div>
  </div>
</section>

<section id="faq">
  <h2>Frequently asked questions</h2>
  <p class="subtitle">Still have questions? Chat with our bot below!</p>
  <div class="faq-item">
    <h3>How long does it take to get set up?</h3>
    <p>Most teams are live in under 30 minutes. Connect your first data source, choose a template dashboard, and you're ready. No SQL or engineering help needed.</p>
  </div>
  <div class="faq-item">
    <h3>Can I change plans at any time?</h3>
    <p>Yes. Upgrades take effect immediately; downgrades apply at your next billing cycle. There are no lock-in contracts on Free or Pro plans.</p>
  </div>
  <div class="faq-item">
    <h3>Is my data safe with Acme Analytics?</h3>
    <p>We are SOC 2 Type II certified, encrypt all data at rest (AES-256) and in transit (TLS 1.3), and never sell your data to third parties. Enterprise customers can choose data residency regions.</p>
  </div>
</section>

<section id="contact">
  <h2>Get in touch</h2>
  <p class="subtitle">Questions about pricing or enterprise plans? We'll get back to you within one business day.</p>
  <div class="contact-form">
    <label>Name</label>
    <input type="text" placeholder="Jane Smith" />
    <label>Work email</label>
    <input type="email" placeholder="jane@company.com" />
    <label>Message</label>
    <textarea rows="4" placeholder="Tell us how we can help..."></textarea>
    <button type="submit">Send message</button>
  </div>
</section>

<footer>
  &copy; 2025 Acme Analytics, Inc. · <a href="#">Privacy</a> · <a href="#">Terms</a>
</footer>

<!-- Pluggable Bot widget -->
<script
  src="http://localhost:8787/widget/pluggable-bot.js"
  data-api-url="http://localhost:8787"
  data-bot-name="Acme Bot"
  data-primary-color="#4f46e5"
></script>

<script>
  function trainBot() {
    fetch('http://localhost:8787/api/train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: location.href,
        title: document.title,
        content: document.body.innerText,
      }),
    })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        alert('Trained! Added ' + d.chunksAdded + ' chunks. Total: ' + d.total + '.');
      })
      .catch(function(err) {
        alert('Training failed: ' + err.message);
      });
  }
</script>

</body>
</html>`;

app.get('/', (c) => {
  return c.html(DEMO_HTML);
});

export default app;
