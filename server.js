// ═══════════ منصة يوسف صلاح - السيرفر ═══════════
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// ⚙️ بيانات المدير (غيّرها هنا)
const ADMIN_USER = 'yousef salah';
const ADMIN_PASS = '##Hh506080Hh##';
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'database.json');

const app = express();

// ───── قاعدة البيانات (ملف JSON بسيط — كل البيانات بتتحفظ فيه) ─────
let db;

function saveDB(){ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function nextId(){ return db.seq++; }

if (fs.existsSync(DB_FILE)) {
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
} else {
  db = { seq: 1, users: [], courses: [], lessons: [], enrollments: [], codes: [], messages: [] };
  db.courses.push(
    { id: nextId(), name: 'كورس اللغة الإنجليزية من الصفر حتى A1',
      description: 'كورس كامل يبدأ معاك من الصفر لحد مستوى A1: قواعد، مفردات، نطق، ومحادثة عملية.',
      price: 300, emoji: '🇬🇧', color: 'linear-gradient(135deg,#2563eb,#1e3a8a)' },
    { id: nextId(), name: 'شرح منهج البرمجة - أولى ثانوي',
      description: 'شرح كامل لمنهج البرمجة أولى ثانوي خطوة بخطوة مع حل الأمثلة والتمارين.',
      price: 250, emoji: '💻', color: 'linear-gradient(135deg,#7c3aed,#4c1d95)' },
    { id: nextId(), name: 'تعلم HTML حتى الاحتراف',
      description: 'اتعلم لغة HTML من أول وسم لحد ما تبني صفحات كاملة باحتراف.',
      price: 200, emoji: '🌐', color: 'linear-gradient(135deg,#ea580c,#9a3412)' }
  );
  // رمز جاهز للكورس الأول
  db.codes.push({ id: nextId(), code: 'KG421356', course_id: 1, used: 0, used_by: null });
  saveDB();
}

app.use(express.json());
app.use(session({
  secret: 'youssef-change-this-secret-951',
  resave: false, saveUninitialized: false,
  cookie: { maxAge: 7*24*60*60*1000 }
}));
app.use(express.static(__dirname));

const cleanUser = u => { const {password, ...rest} = u; return rest; };
function requireLogin(req,res,next){
  if(!req.session.userId) return res.status(401).json({error:'لازم تسجل دخول الأول'});
  next();
}
function requireAdmin(req,res,next){
  if(!req.session.admin) return res.status(401).json({error:'صلاحيات مدير مطلوبة'});
  next();
}

// ═══════════ حسابات الطلاب ═══════════
app.post('/api/signup', (req,res)=>{
  const {first,last,phone,parent,email,pass,grade,gender} = req.body;
  if(!first||!last||!phone||!parent||!email||!pass||!grade||!gender)
    return res.json({ok:false,msg:'املأ كل الحقول'});
  if(pass.length < 6) return res.json({ok:false,msg:'الرقم السري لازم 6 حروف على الأقل'});
  const em = email.trim().toLowerCase();
  if(db.users.find(u=>u.email===em)) return res.json({ok:false,msg:'الإيميل ده مسجل قبل كده'});
  const user = {
    id: nextId(),
    first_name: first.trim(), last_name: last.trim(),
    phone: phone.trim(), parent_phone: parent.trim(),
    email: em, password: bcrypt.hashSync(pass, 10),
    grade, gender,
    created_at: new Date().toLocaleString('ar-EG')
  };
  db.users.push(user); saveDB();
  req.session.userId = user.id;
  res.json({ok:true});
});

app.post('/api/login', (req,res)=>{
  const em = (req.body.email||'').trim().toLowerCase();
  const user = db.users.find(u=>u.email===em);
  if(!user || !bcrypt.compareSync(req.body.pass||'', user.password))
    return res.json({ok:false,msg:'الإيميل أو الرقم السري غلط'});
  req.session.userId = user.id;
  res.json({ok:true});
});

app.post('/api/logout', (req,res)=> req.session.destroy(()=>res.json({ok:true})));

app.get('/api/me', requireLogin, (req,res)=>{
  const user = db.users.find(u=>u.id===req.session.userId);
  const enrollments = db.enrollments
    .filter(e=>e.user_id===user.id)
    .map(e=>({course_id:e.course_id, expires_at:e.expires_at}));
  res.json({user: cleanUser(user), enrollments});
});

// ═══════════ الكورسات ═══════════
app.get('/api/courses', (req,res)=>{
  res.json(db.courses.slice().sort((a,b)=>a.id-b.id));
});

// تفعيل رمز الدخول
app.post('/api/activate', requireLogin, (req,res)=>{
  const courseId = Number(req.body.courseId);
  const code = String(req.body.code||'').trim();
  if(!code) return res.json({ok:false,msg:'اكتب الرمز الأول'});
  const row = db.codes.find(c=>c.code===code);
  if(!row || row.course_id !== courseId) return res.json({ok:false,msg:'الرمز غير صحيح'});
  if(row.used) return res.json({ok:false,msg:'الرمز ده مستخدم قبل كده'});
  if(db.enrollments.find(e=>e.user_id===req.session.userId && e.course_id===courseId))
    return res.json({ok:false,msg:'أنت مشترك في الكورس ده بالفعل'});
  const expires = new Date(Date.now() + 30*24*60*60*1000).toISOString(); // شهر كامل
  db.enrollments.push({ id:nextId(), user_id:req.session.userId, course_id:courseId, expires_at:expires });
  row.used = 1; row.used_by = req.session.userId;
  saveDB();
  res.json({ok:true});
});

// محتوى الكورس (للمشتركين بس والاشتراك ساري)
app.get('/api/course/:id', requireLogin, (req,res)=>{
  const courseId = Number(req.params.id);
  const enr = db.enrollments.find(e=>e.user_id===req.session.userId && e.course_id===courseId);
  if(!enr) return res.status(403).json({error:'أنت مش مشترك في الكورس ده'});
  if(new Date(enr.expires_at) < new Date()) return res.status(403).json({error:'انتهى شهر الاشتراك'});
  const lessons = db.lessons.filter(l=>l.course_id===courseId).sort((a,b)=>a.id-b.id);
  res.json({lessons, expires_at: enr.expires_at});
});

// ═══════════ الدعم ═══════════
app.post('/api/support', requireLogin, (req,res)=>{
  const text = (req.body.text||'').trim();
  if(!text) return res.json({ok:false});
  db.messages.push({ id:nextId(), user_id:req.session.userId, text, reply:null,
    created_at:new Date().toLocaleString('ar-EG'), replied_at:null });
  saveDB();
  res.json({ok:true});
});

app.get('/api/my-messages', requireLogin, (req,res)=>{
  res.json(db.messages.filter(m=>m.user_id===req.session.userId).sort((a,b)=>b.id-a.id));
});

// ═══════════ لوحة المدير ═══════════
app.post('/api/admin/login', (req,res)=>{
  if(req.body.username===ADMIN_USER && req.body.password===ADMIN_PASS){
    req.session.admin = true; return res.json({ok:true});
  }
  res.json({ok:false,msg:'بيانات المدير غلط'});
});
app.post('/api/admin/logout', (req,res)=>{ req.session.admin=false; res.json({ok:true}); });

app.get('/api/admin/messages', requireAdmin, (req,res)=>{
  const msgs = db.messages.slice().sort((a,b)=>b.id-a.id).map(m=>{
    const u = db.users.find(x=>x.id===m.user_id) || {};
    return {...m, first_name:u.first_name, last_name:u.last_name, phone:u.phone, email:u.email};
  });
  res.json(msgs);
});
app.post('/api/admin/reply', requireAdmin, (req,res)=>{
  const m = db.messages.find(x=>x.id===Number(req.body.id));
  if(m){ m.reply = req.body.reply; m.replied_at = new Date().toLocaleString('ar-EG'); saveDB(); }
  res.json({ok:true});
});

app.get('/api/admin/users', requireAdmin, (req,res)=>{
  res.json(db.users.slice().sort((a,b)=>b.id-a.id).map(cleanUser));
});

app.get('/api/admin/courses', requireAdmin, (req,res)=>{
  res.json(db.courses.slice().sort((a,b)=>a.id-b.id));
});
app.post('/api/admin/courses', requireAdmin, (req,res)=>{
  const {name,description,price,emoji} = req.body;
  db.courses.push({ id:nextId(), name, description, price:Number(price)||0,
    emoji: emoji||'📚', color:'linear-gradient(135deg,#1e3a8a,#3b82f6)' });
  saveDB();
  res.json({ok:true});
});

app.post('/api/admin/codes', requireAdmin, (req,res)=>{
  const c = String(req.body.code||'').trim().toUpperCase();
  if(!c) return res.json({ok:false,msg:'اكتب الرمز'});
  if(db.codes.find(x=>x.code===c)) return res.json({ok:false,msg:'الرمز ده موجود قبل كده'});
  db.codes.push({ id:nextId(), code:c, course_id:Number(req.body.course_id), used:0, used_by:null });
  saveDB();
  res.json({ok:true});
});
app.get('/api/admin/codes', requireAdmin, (req,res)=>{
  const courseId = Number(req.query.course_id);
  const codes = db.codes.filter(c=>c.course_id===courseId).sort((a,b)=>b.id-a.id).map(c=>{
    const u = c.used_by ? db.users.find(x=>x.id===c.used_by) : null;
    return {...c, used_by_name: u ? u.first_name : null};
  });
  res.json(codes);
});

app.post('/api/admin/lessons', requireAdmin, (req,res)=>{
  const {course_id,title,video_url,description} = req.body;
  if(!title) return res.json({ok:false,msg:'اكتب عنوان الدرس'});
  db.lessons.push({ id:nextId(), course_id:Number(course_id), title,
    video_url: video_url||null, description: description||null });
  saveDB();
  res.json({ok:true});
});
app.get('/api/admin/lessons', requireAdmin, (req,res)=>{
  res.json(db.lessons.filter(l=>l.course_id===Number(req.query.course_id)).sort((a,b)=>a.id-b.id));
});

app.listen(PORT, ()=>{
  console.log('✅ السيرفر شغال: http://localhost:' + PORT);
  console.log('👑 لوحة المدير: http://localhost:' + PORT + '/admin.html');
});

/* نسخة PostgreSQL للنشر على الإنترنت - محفوظة هنا كمرجع غير مُنفّذ.
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const path = require('path');

// ⚙️ بيانات المدير (على Render هنحط الرقم السري في Environment Variables)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.log('⚠️ النسخة دي للنشر على النت — محتاجة DATABASE_URL (هنعملها في خطوات Render و Neon)');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB(){
  await pool.query(`CREATE TABLE IF NOT EXISTS users(
    id SERIAL PRIMARY KEY,
    first_name TEXT NOT NULL, last_name TEXT NOT NULL,
    phone TEXT NOT NULL, parent_phone TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
    grade TEXT NOT NULL, gender TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS courses(
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL, description TEXT NOT NULL,
    price INTEGER NOT NULL, emoji TEXT DEFAULT '📚',
    color TEXT DEFAULT 'linear-gradient(135deg,#1e3a8a,#3b82f6)'
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS lessons(
    id SERIAL PRIMARY KEY, course_id INTEGER NOT NULL,
    title TEXT NOT NULL, video_url TEXT, description TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS enrollments(
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, course_id INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, course_id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS codes(
    id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL,
    course_id INTEGER NOT NULL, used INTEGER DEFAULT 0, used_by INTEGER
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS messages(
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, text TEXT NOT NULL,
    reply TEXT, created_at TIMESTAMP DEFAULT NOW(), replied_at TEXT
  )`);

  // أول مرة فقط: إضافة الكورسات والرمز الأول
  const r = await pool.query('SELECT COUNT(*)::int AS n FROM courses');
  if (r.rows[0].n === 0) {
    const c1 = await pool.query(
      'INSERT INTO courses(name,description,price,emoji,color) VALUES($1,$2,$3,$4,$5) RETURNING id',
      ['كورس اللغة الإنجليزية من الصفر حتى A1',
       'كورس كامل يبدأ معاك من الصفر لحد مستوى A1: قواعد، مفردات، نطق، ومحادثة عملية.',
       300, '🇬🇧', 'linear-gradient(135deg,#2563eb,#1e3a8a)']);
    await pool.query(
      'INSERT INTO courses(name,description,price,emoji,color) VALUES($1,$2,$3,$4,$5)',
      ['شرح منهج البرمجة - أولى ثانوي',
       'شرح كامل لمنهج البرمجة أولى ثانوي خطوة بخطوة مع حل الأمثلة والتمارين.',
       250, '💻', 'linear-gradient(135deg,#7c3aed,#4c1d95)']);
    await pool.query(
      'INSERT INTO courses(name,description,price,emoji,color) VALUES($1,$2,$3,$4,$5)',
      ['تعلم HTML حتى الاحتراف',
       'اتعلم لغة HTML من أول وسم لحد ما تبني صفحات كاملة باحتراف.',
       200, '🌐', 'linear-gradient(135deg,#ea580c,#9a3412)']);
    await pool.query('INSERT INTO codes(code,course_id) VALUES($1,$2)', ['KG421356', c1.rows[0].id]);
  }
}

const app = express();
app.use(express.json());
app.use(session({
  secret: 'youssef-change-this-secret-951',
  resave: false, saveUninitialized: false,
  cookie: { maxAge: 7*24*60*60*1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

const cleanUser = u => { const {password, ...rest} = u; return rest; };
function requireLogin(req,res,next){
  if(!req.session.userId) return res.status(401).json({error:'لازم تسجل دخول الأول'});
  next();
}
function requireAdmin(req,res,next){
  if(!req.session.admin) return res.status(401).json({error:'صلاحيات مدير مطلوبة'});
  next();
}

// ═══════════ حسابات الطلاب ═══════════
app.post('/api/signup', async (req,res)=>{
  const {first,last,phone,parent,email,pass,grade,gender} = req.body;
  if(!first||!last||!phone||!parent||!email||!pass||!grade||!gender)
    return res.json({ok:false,msg:'املأ كل الحقول'});
  if(pass.length < 6) return res.json({ok:false,msg:'الرقم السري لازم 6 حروف على الأقل'});
  const em = email.trim().toLowerCase();
  try {
    const ex = await pool.query('SELECT id FROM users WHERE email=$1',[em]);
    if(ex.rows.length) return res.json({ok:false,msg:'الإيميل ده مسجل قبل كده'});
    const ins = await pool.query(
      `INSERT INTO users(first_name,last_name,phone,parent_phone,email,password,grade,gender)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [first.trim(),last.trim(),phone.trim(),parent.trim(),em,bcrypt.hashSync(pass,10),grade,gender]);
    req.session.userId = ins.rows[0].id;
    res.json({ok:true});
  } catch(e){ res.json({ok:false,msg:'حصل خطأ، حاول تاني'}); }
});

app.post('/api/login', async (req,res)=>{
  try {
    const em = (req.body.email||'').trim().toLowerCase();
    const r = await pool.query('SELECT * FROM users WHERE email=$1',[em]);
    const user = r.rows[0];
    if(!user || !bcrypt.compareSync(req.body.pass||'', user.password))
      return res.json({ok:false,msg:'الإيميل أو الرقم السري غلط'});
    req.session.userId = user.id;
    res.json({ok:true});
  } catch(e){ res.json({ok:false,msg:'حصل خطأ، حاول تاني'}); }
});

app.post('/api/logout', (req,res)=> req.session.destroy(()=>res.json({ok:true})));

app.get('/api/me', requireLogin, async (req,res)=>{
  const u = (await pool.query('SELECT * FROM users WHERE id=$1',[req.session.userId])).rows[0];
  if(!u) { req.session.destroy(()=>{}); return res.status(401).json({error:'سجل دخول تاني'}); }
  const enr = await pool.query('SELECT course_id, expires_at FROM enrollments WHERE user_id=$1 ORDER BY id',[u.id]);
  res.json({user: cleanUser(u), enrollments: enr.rows});
});

// ═══════════ الكورسات ═══════════
app.get('/api/courses', async (req,res)=>{
  res.json((await pool.query('SELECT * FROM courses ORDER BY id')).rows);
});

app.post('/api/activate', requireLogin, async (req,res)=>{
  const courseId = Number(req.body.courseId);
  const code = String(req.body.code||'').trim();
  if(!code) return res.json({ok:false,msg:'اكتب الرمز الأول'});
  try {
    const c = (await pool.query('SELECT * FROM codes WHERE code=$1',[code])).rows[0];
    if(!c || c.course_id !== courseId) return res.json({ok:false,msg:'الرمز غير صحيح'});
    if(c.used) return res.json({ok:false,msg:'الرمز ده مستخدم قبل كده'});
    const ex = await pool.query('SELECT id FROM enrollments WHERE user_id=$1 AND course_id=$2',[req.session.userId,courseId]);
    if(ex.rows.length) return res.json({ok:false,msg:'أنت مشترك في الكورس ده بالفعل'});
    const expires = new Date(Date.now() + 30*24*60*60*1000);
    await pool.query('INSERT INTO enrollments(user_id,course_id,expires_at) VALUES($1,$2,$3)',[req.session.userId,courseId,expires]);
    await pool.query('UPDATE codes SET used=1, used_by=$1 WHERE id=$2',[req.session.userId,c.id]);
    res.json({ok:true});
  } catch(e){ res.json({ok:false,msg:'حصل خطأ، حاول تاني'}); }
});

app.get('/api/course/:id', requireLogin, async (req,res)=>{
  const courseId = Number(req.params.id);
  const enr = (await pool.query('SELECT * FROM enrollments WHERE user_id=$1 AND course_id=$2',[req.session.userId,courseId])).rows[0];
  if(!enr) return res.status(403).json({error:'أنت مش مشترك في الكورس ده'});
  if(new Date(enr.expires_at) < new Date()) return res.status(403).json({error:'انتهى شهر الاشتراك'});
  const lessons = (await pool.query('SELECT * FROM lessons WHERE course_id=$1 ORDER BY id',[courseId])).rows;
  res.json({lessons, expires_at: enr.expires_at});
});

// ═══════════ الدعم ═══════════
app.post('/api/support', requireLogin, async (req,res)=>{
  const text = (req.body.text||'').trim();
  if(!text) return res.json({ok:false});
  await pool.query('INSERT INTO messages(user_id,text) VALUES($1,$2)',[req.session.userId,text]);
  res.json({ok:true});
});

app.get('/api/my-messages', requireLogin, async (req,res)=>{
  res.json((await pool.query('SELECT * FROM messages WHERE user_id=$1 ORDER BY id DESC',[req.session.userId])).rows);
});

// ═══════════ لوحة المدير ═══════════
app.post('/api/admin/login', (req,res)=>{
  if(req.body.username===ADMIN_USER && req.body.password===ADMIN_PASS){
    req.session.admin = true; return res.json({ok:true});
  }
  res.json({ok:false,msg:'بيانات المدير غلط'});
});
app.post('/api/admin/logout', (req,res)=>{ req.session.admin=false; res.json({ok:true}); });

app.get('/api/admin/messages', requireAdmin, async (req,res)=>{
  res.json((await pool.query(`SELECT m.*, u.first_name, u.last_name, u.phone, u.email
    FROM messages m JOIN users u ON u.id=m.user_id ORDER BY m.id DESC`)).rows);
});
app.post('/api/admin/reply', requireAdmin, async (req,res)=>{
  await pool.query('UPDATE messages SET reply=$1, replied_at=$2 WHERE id=$3',
    [req.body.reply, new Date().toLocaleString('ar-EG'), Number(req.body.id)]);
  res.json({ok:true});
});

app.get('/api/admin/users', requireAdmin, async (req,res)=>{
  res.json((await pool.query('SELECT * FROM users ORDER BY id DESC')).rows.map(cleanUser));
});

app.get('/api/admin/courses', requireAdmin, async (req,res)=>{
  res.json((await pool.query('SELECT * FROM courses ORDER BY id')).rows);
});
app.post('/api/admin/courses', requireAdmin, async (req,res)=>{
  const {name,description,price,emoji} = req.body;
  await pool.query('INSERT INTO courses(name,description,price,emoji) VALUES($1,$2,$3,$4)',
    [name,description,Number(price)||0,emoji||'📚']);
  res.json({ok:true});
});

app.post('/api/admin/codes', requireAdmin, async (req,res)=>{
  const c = String(req.body.code||'').trim().toUpperCase();
  if(!c) return res.json({ok:false,msg:'اكتب الرمز'});
  try {
    await pool.query('INSERT INTO codes(code,course_id) VALUES($1,$2)',[c,Number(req.body.course_id)]);
    res.json({ok:true});
  } catch(e){ res.json({ok:false,msg:'الرمز ده موجود قبل كده'}); }
});
app.get('/api/admin/codes', requireAdmin, async (req,res)=>{
  res.json((await pool.query(`SELECT c.*, u.first_name AS used_by_name FROM codes c
    LEFT JOIN users u ON u.id=c.used_by WHERE c.course_id=$1 ORDER BY c.id DESC`,
    [Number(req.query.course_id)])).rows);
});

app.post('/api/admin/lessons', requireAdmin, async (req,res)=>{
  const {course_id,title,video_url,description} = req.body;
  if(!title) return res.json({ok:false,msg:'اكتب عنوان الدرس'});
  await pool.query('INSERT INTO lessons(course_id,title,video_url,description) VALUES($1,$2,$3,$4)',
    [Number(course_id), title, video_url||null, description||null]);
  res.json({ok:true});
});
app.get('/api/admin/lessons', requireAdmin, async (req,res)=>{
  res.json((await pool.query('SELECT * FROM lessons WHERE course_id=$1 ORDER BY id',[Number(req.query.course_id)])).rows);
});

initDB().then(()=>{
  app.listen(PORT, ()=>{
    console.log('✅ السيرفر شغال على المنفذ ' + PORT);
  });
}).catch(e=>{
  console.log('❌ مشكلة في قاعدة البيانات: ' + e.message);
  process.exit(1);
});
*/
