// Lead Dashboard + Lead Recorder — Cloudflare Worker
// Deploy: ask-q-leads.miyicioglu.workers.dev
// Endpoints: POST /lead (kaydet), GET /leads (listele), GET /leads/stats, GET /

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    
    // CORS headers
    const CORS = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json'
    };
    
    // OPTIONS (preflight)
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    
    // Authenticate (optional — token check)
    const authHeader = request.headers.get('Authorization') || '';
    const expectedToken = env.DASHBOARD_TOKEN || 'none';
    const isAuth = !expectedToken || expectedToken === 'none' || authHeader === `Bearer ${expectedToken}`;
    
    // POST /lead — Yeni lead kaydet (Ask·Q tarafından çağrılır)
    if (method === 'POST' && path === '/lead') {
      try {
        const body = await request.json();
        const leadKey = 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        
        // KV'ye kaydet (90 gün TTL)
        if (env.LEADS_KV) {
          await env.LEADS_KV.put(leadKey, JSON.stringify(body), { 
            expirationTtl: 7776000 
          });
        }
        
        // Discord/Slack webhook (isteğe bağlı)
        if (env.WEBHOOK_URL) {
          try {
            await fetch(env.WEBHOOK_URL, {
              method: 'POST',
              body: JSON.stringify({
                name: body.name || 'Unknown',
                phone: body.phone || '',
                topic: body.topic || '',
                type: body.type || '',
                answers: body.answers || [],
                note: body.note || '',
                timestamp: body.timestamp || new Date().toISOString()
              }),
              headers: { 'Content-Type': 'application/json' }
            }).catch(() => {});
          } catch (e) {}
        }
        
        return new Response(JSON.stringify({ ok: true, id: leadKey }), { 
          headers: CORS 
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { 
          status: 400, 
          headers: CORS 
        });
      }
    }
    
    // GET /leads — Leadleri listele (Dashboard'dan çağrılır)
    if (method === 'GET' && path === '/leads') {
      // Authenticate
      if (expectedToken !== 'none' && authHeader !== `Bearer ${expectedToken}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
          status: 401, 
          headers: CORS 
        });
      }
      
      try {
        const limit = parseInt(url.searchParams.get('limit')) || 100;
        const topic = url.searchParams.get('topic');
        const type = url.searchParams.get('type');
        
        const leads = [];
        
        if (env.LEADS_KV) {
          // List all keys
          const list = await env.LEADS_KV.list({ prefix: 'lead_', limit: 1000 });
          
          for (const item of list.keys) {
            if (leads.length >= limit) break;
            
            const json = await env.LEADS_KV.get(item.name);
            if (!json) continue;
            
            try {
              const lead = JSON.parse(json);
              lead.id = item.name;
              
              // Filter by topic
              if (topic && lead.topic !== topic) continue;
              // Filter by type
              if (type && lead.type !== type) continue;
              
              leads.push(lead);
            } catch (e) {
              console.error('Parse lead failed:', e);
            }
          }
        }
        
        // Sort by timestamp descending
        leads.sort((a, b) => {
          const aTime = new Date(a.timestamp || 0).getTime();
          const bTime = new Date(b.timestamp || 0).getTime();
          return bTime - aTime;
        });
        
        return new Response(JSON.stringify({ 
          ok: true, 
          count: leads.length, 
          leads: leads 
        }), { 
          headers: CORS 
        });
      } catch (e) {
        console.error('List leads failed:', e);
        return new Response(JSON.stringify({ error: e.message }), { 
          status: 500, 
          headers: CORS 
        });
      }
    }
    
    // GET /leads/stats — İstatistikler
    if (method === 'GET' && path === '/leads/stats') {
      if (expectedToken !== 'none' && authHeader !== `Bearer ${expectedToken}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
          status: 401, 
          headers: CORS 
        });
      }
      
      try {
        const leads = [];
        if (env.LEADS_KV) {
          const list = await env.LEADS_KV.list({ prefix: 'lead_', limit: 1000 });
          for (const item of list.keys) {
            const json = await env.LEADS_KV.get(item.name);
            if (json) {
              try {
                leads.push(JSON.parse(json));
              } catch (e) {}
            }
          }
        }
        
        const topicCount = {};
        const typeCount = {};
        leads.forEach(lead => {
          topicCount[lead.topic] = (topicCount[lead.topic] || 0) + 1;
          typeCount[lead.type] = (typeCount[lead.type] || 0) + 1;
        });
        
        const last24 = leads.filter(l => {
          const age = Date.now() - new Date(l.timestamp || 0).getTime();
          return age < 24 * 60 * 60 * 1000;
        }).length;
        
        return new Response(JSON.stringify({ 
          ok: true, 
          total: leads.length,
          last24h: last24,
          byTopic: topicCount,
          byType: typeCount,
          avgScore: leads.length > 0 ? Math.round(
            leads.reduce((sum, l) => sum + calcScore(l), 0) / leads.length
          ) : 0
        }), { 
          headers: CORS 
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { 
          status: 500, 
          headers: CORS 
        });
      }
    }
    
    // Health check
    if (path === '/' && method === 'GET') {
      return new Response(JSON.stringify({ 
        status: 'ok', 
        service: 'lead-recorder',
        endpoints: ['/lead (POST)', '/leads (GET)', '/leads/stats (GET)']
      }), { 
        headers: CORS 
      });
    }
    
    return new Response(JSON.stringify({ error: 'Not found' }), { 
      status: 404, 
      headers: CORS 
    });
  }
};

// Helper — Conversion score hesapla
function calcScore(lead) {
  let score = 50;
  if (lead.phone) score += 15;
  if (lead.context && lead.context.length > 2) score += 15;
  if (lead.answers && lead.answers.length > 0) score += 10;
  if (lead.note && lead.note.length > 20) score += 10;
  const age = Date.now() - new Date(lead.timestamp || 0).getTime();
  if (age < 60 * 60 * 1000) score += 5; // Fresh lead bonus
  return Math.min(score, 100);
}
