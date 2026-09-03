// ═══════════ منصة يوسف صلاح - v2 (امتحانات + كتب + تعطيل حسابات) ═══════════
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const path = require('path');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.log('⚠️ النسخة دي للنشر — محتاجة DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB(){
  await pool.query(`CREATE TABLE IF NOT EXISTS users(
    id SERIAL PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
    phone TEXT NOT NULL, parent_phone TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, grade TEXT NOT NULL, gender TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS courses(
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
    price INTEGER NOT NULL, emoji TEXT DEFAULT '📚',
    color TEXT DEFAULT 'linear-gradient(135deg,#1e3a8a,#3b82f6)')`);
  await pool.query(`CREATE TABLE IF NOT EXISTS lessons(
    id SERIAL PRIMARY KEY, course_id INTEGER NOT NULL,
    title TEXT NOT NULL, video_url TEXT, description TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS enrollments(
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, course_id INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, course_id))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS codes(
    id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, course_id INTEGER NOT NULL,
    used INTEGER DEFAULT 0, used_by INTEGER, item_type TEXT DEFAULT 'course')`);
  await pool.query(`CREATE TABLE IF NOT EXISTS messages(
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, text TEXT NOT NULL,
    reply TEXT, created_at TIMESTAMP DEFAULT NOW(), replied_at TEXT)`);
  // ── جديد v2 ──
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled INTEGER DEFAULT 0`);
  await pool.query(`CREATE TABLE IF NOT EXISTS books(
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT,
    price INTEGER NOT NULL, emoji TEXT DEFAULT '📖', pdf_url TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS exams(
    id SERIAL PRIMARY KEY, course_id INTEGER NOT NULL,
    title TEXT NOT NULL, duration_minutes INTEGER DEFAULT 30,
    status TEXT DEFAULT 'closed', created_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS questions(
    id SERIAL PRIMARY KEY, exam_id INTEGER NOT NULL,
    type TEXT NOT NULL, text TEXT NOT NULL,
    options TEXT, order_items TEXT, correct TEXT, points INTEGER DEFAULT 1)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS submissions(
    id SERIAL PRIMARY KEY, exam_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
    answers TEXT, score REAL DEFAULT 0, essay_score REAL DEFAULT 0,
    essay_pending INTEGER DEFAULT 0, time_taken INTEGER DEFAULT 0,
    submitted_at TIMESTAMP DEFAULT NOW(), UNIQUE(exam_id, user_id))`);
}

const app = express();
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
    if(user.disabled) return res.json({ok:false,msg:'تم تعطيل حسابك — تواصل مع الدعم'});
    req.session.userId = user.id;
    res.json({ok:true});
  } catch(e){ res.json({ok:false,msg:'حصل خطأ، حاول تاني'}); }
});

app.post('/api/logout', (req,res)=> req.session.destroy(()=>res.json({ok:true})));

app.get('/api/me', requireLogin, async (req,res)=>{
  const u = (await pool.query('SELECT * FROM users WHERE id=$1',[req.session.userId])).rows[0];
  if(!u) { req.session.destroy(()=>{}); return res.status(401).json({error:'سجل دخول تاني'}); }
  if(u.disabled) return res.status(403).json({error:'تم تعطيل حسابك — تواصل مع الدعم'});
  const enr = await pool.query('SELECT course_id, expires_at FROM enrollments WHERE user_id=$1 ORDER BY id',[u.id]);
  const bk = await pool.query('SELECT course_id AS book_id FROM codes WHERE used_by=$1 AND item_type=$2',[u.id,'book']);
  res.json({user: cleanUser(u), enrollments: enr.rows, books: bk.rows});
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
    const c = (await pool.query("SELECT * FROM codes WHERE code=$1 AND item_type='course'",[code])).rows[0];
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

// ═══════════ الامتحانات (للطلاب) ═══════════
app.get('/api/exam/:courseId', requireLogin, async (req,res)=>{
  const courseId = Number(req.params.courseId);
  const enr = (await pool.query('SELECT id FROM enrollments WHERE user_id=$1 AND course_id=$2',[req.session.userId,courseId])).rows[0];
  if(!enr) return res.status(403).json({error:'أنت مش مشترك في الكورس ده'});
  const exam = (await pool.query('SELECT * FROM exams WHERE course_id=$1 ORDER BY id DESC LIMIT 1',[courseId])).rows[0];
  if(!exam) return res.json({status:'none'});
  if(exam.status==='results') return res.json({status:'results', examTitle: exam.title});
  if(exam.status!=='open') return res.json({status:'closed'});
  const sub = (await pool.query('SELECT * FROM submissions WHERE exam_id=$1 AND user_id=$2',[exam.id,req.session.userId])).rows[0];
  if(sub) return res.json({status:'submitted', score: sub.score+sub.essay_score, essayPending: !!sub.essay_pending});
  const qs = (await pool.query('SELECT * FROM questions WHERE exam_id=$1 ORDER BY id',[exam.id])).rows
    .map(q=>{
      const o = {id:q.id, type:q.type, text:q.text, points:q.points};
      if(q.type==='mcq') o.options = JSON.parse(q.options||'[]');
      if(q.type==='order'){
        const items = JSON.parse(q.order_items||'[]');
        for(let i=items.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [items[i],items[j]]=[items[j],items[i]]; }
        o.items = items;
      }
      return o;
    });
  res.json({status:'open', examTitle: exam.title, duration: exam.duration_minutes, questions: qs});
});

app.post('/api/exam/:courseId/submit', requireLogin, async (req,res)=>{
  const courseId = Number(req.params.courseId);
  const exam = (await pool.query("SELECT * FROM exams WHERE course_id=$1 ORDER BY id DESC LIMIT 1",[courseId])).rows[0];
  if(!exam || exam.status!=='open') return res.json({ok:false,msg:'الامتحان مقفول'});
  const sub = (await pool.query('SELECT id FROM submissions WHERE exam_id=$1 AND user_id=$2',[exam.id,req.session.userId])).rows[0];
  if(sub) return res.json({ok:false,msg:'أنت سلمت الامتحان ده قبل كده'});
  const answers = Array.isArray(req.body.answers)? req.body.answers : [];
  const timeTaken = Math.max(0, Math.min(Number(req.body.time_taken)||0, 24*60*60));
  const qs = (await pool.query('SELECT * FROM questions WHERE exam_id=$1',[exam.id])).rows;
  let score = 0, essayPending = 0;
  for(const q of qs){
    const a = answers.find(x=>Number(x.qid)===q.id);
    if(q.type==='mcq' || q.type==='truefalse'){
      if(a && String(a.value??'').trim() === String(q.correct||'').trim()) score += Number(q.points)||1;
    } else if(q.type==='order'){
      if(a && Array.isArray(a.value)){
        const correct = JSON.parse(q.order_items||'[]');
        if(JSON.stringify(a.value)===JSON.stringify(correct)) score += Number(q.points)||1;
      }
    } else if(q.type==='essay'){ essayPending = 1; }
  }
  await pool.query(
    `INSERT INTO submissions(exam_id,user_id,answers,score,essay_pending,time_taken)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [exam.id, req.session.userId, JSON.stringify(answers), score, essayPending, timeTaken]);
  res.json({ok:true, score, essayPending: !!essayPending});
});

app.get('/api/exam/:courseId/honor', async (req,res)=>{
  const courseId = Number(req.params.courseId);
  const exam = (await pool.query('SELECT * FROM exams WHERE course_id=$1 ORDER BY id DESC LIMIT 1',[courseId])).rows[0];
  if(!exam || exam.status!=='results') return res.json({status:'closed'});
  const rows = (await pool.query(
    `SELECT u.first_name, u.last_name, u.grade,
            (s.score+s.essay_score) AS total, s.time_taken, s.essay_pending
     FROM submissions s JOIN users u ON u.id=s.user_id
     WHERE s.exam_id=$1 ORDER BY total DESC, s.time_taken ASC`,[exam.id])).rows;
  res.json({status:'results', examTitle: exam.title, results: rows});
});

// ═══════════ الكتب ═══════════
app.get('/api/books', async (req,res)=>{
  res.json((await pool.query('SELECT * FROM books ORDER BY id DESC')).rows);
});
app.post('/api/activate-book', requireLogin, async (req,res)=>{
  const bookId = Number(req.body.bookId);
  const code = String(req.body.code||'').trim();
  const c = (await pool.query("SELECT * FROM codes WHERE code=$1 AND item_type='book'",[code])).rows[0];
  if(!c || c.course_id !== bookId) return res.json({ok:false,msg:'الرمز غير صحيح'});
  if(c.used) return res.json({ok:false,msg:'الرمز ده مستخدم قبل كده'});
  await pool.query('UPDATE codes SET used=1, used_by=$1 WHERE id=$2',[req.session.userId,c.id]);
  res.json({ok:true});
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
app.post('/api/admin/toggle-user', requireAdmin, async (req,res)=>{
  const u = (await pool.query('SELECT disabled FROM users WHERE id=$1',[Number(req.body.user_id)])).rows[0];
  if(!u) return res.json({ok:false});
  await pool.query('UPDATE users SET disabled=$1 WHERE id=$2',[u.disabled?0:1, Number(req.body.user_id)]);
  res.json({ok:true, disabled: u.disabled?0:1});
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
  const itemType = (req.body.item_type==='book') ? 'book' : 'course';
  if(!c) return res.json({ok:false,msg:'اكتب الرمز'});
  try {
    await pool.query('INSERT INTO codes(code,course_id,item_type) VALUES($1,$2,$3)',
      [c, Number(req.body.item_id||req.body.course_id), itemType]);
    res.json({ok:true});
  } catch(e){ res.json({ok:false,msg:'الرمز ده موجود قبل كده'}); }
});
app.get('/api/admin/codes', requireAdmin, async (req,res)=>{
  const itemType = req.query.item_type || 'course';
  const itemId = Number(req.query.item_id || req.query.course_id);
  res.json((await pool.query(`SELECT c.*, u.first_name AS used_by_name FROM codes c
    LEFT JOIN users u ON u.id=c.used_by
    WHERE c.item_type=$1 AND c.course_id=$2 ORDER BY c.id DESC`,[itemType,itemId])).rows);
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

// ─── الكتب (مدير) ───
app.post('/api/admin/books', requireAdmin, async (req,res)=>{
  const {title,description,price,emoji,pdf_url} = req.body;
  if(!title) return res.json({ok:false,msg:'اكتب اسم الكتاب'});
  await pool.query('INSERT INTO books(title,description,price,emoji,pdf_url) VALUES($1,$2,$3,$4,$5)',
    [title, description||'', Number(price)||0, emoji||'📖', pdf_url||null]);
  res.json({ok:true});
});
app.get('/api/admin/books', requireAdmin, async (req,res)=>{
  res.json((await pool.query('SELECT * FROM books ORDER BY id DESC')).rows);
});
app.post('/api/admin/books/delete', requireAdmin, async (req,res)=>{
  await pool.query('DELETE FROM books WHERE id=$1',[Number(req.body.id)]);
  res.json({ok:true});
});

// ─── الامتحانات (مدير) ───
app.get('/api/admin/exam', requireAdmin, async (req,res)=>{
  const courseId = Number(req.query.course_id);
  const exam = (await pool.query('SELECT * FROM exams WHERE course_id=$1 ORDER BY id DESC LIMIT 1',[courseId])).rows[0];
  if(!exam) return res.json({exam:null});
  const questions = (await pool.query('SELECT * FROM questions WHERE exam_id=$1 ORDER BY id',[exam.id])).rows
    .map(q=>({...q, options: q.options?JSON.parse(q.options):null, order_items: q.order_items?JSON.parse(q.order_items):null}));
  const subs = (await pool.query(
    `SELECT s.*, u.first_name, u.last_name FROM submissions s
     JOIN users u ON u.id=s.user_id WHERE s.exam_id=$1 ORDER BY (s.score+s.essay_score) DESC, s.time_taken ASC`,[exam.id])).rows;
  res.json({exam, questions, submissions: subs});
});
app.post('/api/admin/exam', requireAdmin, async (req,res)=>{
  const courseId = Number(req.body.course_id);
  const old = (await pool.query('SELECT id FROM exams WHERE course_id=$1',[courseId])).rows[0];
  if(old) return res.json({ok:false,msg:'فيه امتحان موجود للكورس ده — امسحه الأول'});
  await pool.query('INSERT INTO exams(course_id,title,duration_minutes) VALUES($1,$2,$3)',
    [courseId, req.body.title||'امتحان', Number(req.body.duration_minutes)||30]);
  res.json({ok:true});
});
app.post('/api/admin/exam/status', requireAdmin, async (req,res)=>{
  const st = req.body.status;
  if(!['open','closed','results'].includes(st)) return res.json({ok:false,msg:'حالة غير صحيحة'});
  await pool.query('UPDATE exams SET status=$1 WHERE id=$2',[st, Number(req.body.exam_id)]);
  res.json({ok:true});
});
app.post('/api/admin/exam/delete', requireAdmin, async (req,res)=>{
  const examId = Number(req.body.exam_id);
  await pool.query('DELETE FROM submissions WHERE exam_id=$1',[examId]);
  await pool.query('DELETE FROM questions WHERE exam_id=$1',[examId]);
  await pool.query('DELETE FROM exams WHERE id=$1',[examId]);
  res.json({ok:true});
});
app.post('/api/admin/exam/question', requireAdmin, async (req,res)=>{
  const {exam_id,type,text,points,options,order_items,correct} = req.body;
  if(!text) return res.json({ok:false,msg:'اكتب نص السؤال'});
  await pool.query(
    'INSERT INTO questions(exam_id,type,text,points,options,order_items,correct) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [Number(exam_id), type, text, Number(points)||1,
     options?JSON.stringify(options):null,
     order_items?JSON.stringify(order_items):null,
     correct||null]);
  res.json({ok:true});
});
app.post('/api/admin/exam/question/delete', requireAdmin, async (req,res)=>{
  await pool.query('DELETE FROM questions WHERE id=$1',[Number(req.body.id)]);
  res.json({ok:true});
});
app.post('/api/admin/exam/grade', requireAdmin, async (req,res)=>{
  const subId = Number(req.body.submission_id);
  const grades = req.body.grades || {};
  const essayTotal = Object.values(grades).reduce((a,b)=>a+(Number(b)||0),0);
  await pool.query('UPDATE submissions SET essay_score=$1, essay_pending=0 WHERE id=$2',[essayTotal, subId]);
  res.json({ok:true});
});

initDB().then(()=>{
  app.listen(PORT, ()=> console.log('✅ السيرفر شغال على المنفذ ' + PORT));
}).catch(e=>{
  console.log('❌ مشكلة في قاعدة البيانات: ' + e.message);
  process.exit(1);
});


