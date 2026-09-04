let me = null, courses = [], timerInt = null, examInt = null,
    examAnswers = {}, examData = null, examStart = 0, currentCourse = null, currentViewed = [];
const WA_NUMBER = '201283674859';

const esc = s => String(s??'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const waLink = t => 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(t);
const goTo = id => { document.getElementById(id).scrollIntoView({behavior:'smooth'}); };
const fmtTime = s => { const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=Math.floor(s%60);
  return (h?h+' ساعة ':'')+(m?m+' دقيقة ':'')+x+' ثانية'; };

function switchTab(t){
  document.getElementById('tabLogin').classList.toggle('active', t==='login');
  document.getElementById('tabSignup').classList.toggle('active', t==='signup');
  document.getElementById('loginForm').classList.toggle('hidden', t!=='login');
  document.getElementById('signupForm').classList.toggle('hidden', t!=='signup');
}

async function doLogin(e){
  e.preventDefault();
  try {
    const r = await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:loginEmail.value, pass:loginPass.value})});
    const d = await r.json();
    if(d.ok) location.reload();
    else document.getElementById('loginMsg').innerHTML = '<div class="error">'+esc(d.msg)+'</div>';
  } catch(err){
    document.getElementById('loginMsg').innerHTML = '<div class="error">السيرفر مش شغال</div>';
  }
}

async function doSignup(e){
  e.preventDefault();
  const body = {first:suFirst.value,last:suLast.value,phone:suPhone.value,parent:suParent.value,
    email:suEmail.value,pass:suPass.value,grade:suGrade.value,gender:suGender.value};
  try {
    const r = await fetch('/api/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d = await r.json();
    if(d.ok) location.reload();
    else document.getElementById('signupMsg').innerHTML = '<div class="error">'+esc(d.msg)+'</div>';
  } catch(err){
    document.getElementById('signupMsg').innerHTML = '<div class="error">السيرفر مش شغال</div>';
  }
}

async function doLogout(){ await fetch('/api/logout',{method:'POST'}); location.reload(); }

function showApp(){
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderProfile(); loadReplies(); loadBooks(); loadNotifs();
      loadStudentsCount();
  setInterval(loadNotifs, 25000);
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
}

async function loadNotifs(){
  try {
    const d = await fetch('/api/notifications').then(r=>r.json());
    const b = document.getElementById('nBadge');
    if(d.unread > 0){ b.textContent = d.unread > 99 ? '99+' : d.unread; b.classList.remove('hidden'); }
    else b.classList.add('hidden');
  } catch(e){}
}

async function openNotifs(){
  document.getElementById('notifPanel').classList.remove('hidden');
  const d = await fetch('/api/notifications').then(r=>r.json());
  document.getElementById('notifList').innerHTML = d.rows.length ? d.rows.map(n=>
    `<div class="notifRow ${n.read?'':'unread'}">${esc(n.text)}
      <div class="tm">${new Date(n.created_at).toLocaleString('ar-EG')}</div></div>`).join('')
    : '<div class="noReply">مفيش إشعارات لسه</div>';
  await fetch('/api/notifications/read',{method:'POST'});
  document.getElementById('nBadge').classList.add('hidden');
}

function closeNotifs(){
  document.getElementById('notifPanel').classList.add('hidden');
  loadNotifs();
}

function renderProfile(){
  const u = me.user;
  const enrolls = me.enrollments.map(e=>{
    const c = courses.find(x=>x.id===e.course_id);
    const active = new Date(e.expires_at) > new Date();
    return `<div class="profileRow"><span class="lbl">${esc(c?c.name:'كورس')}</span>
      <span class="val">${active?'✅ ساري لـ '+new Date(e.expires_at).toLocaleDateString('ar-EG'):'⌛ منتهي'}</span></div>`;
  }).join('');
  const myBooks = (me.books||[]).map(b=>{
    const bk = allBooks.find(x=>x.id===b.book_id);
    return `<div class="profileRow"><span class="lbl">📖 ${esc(bk?bk.title:'كتاب')}</span>
      <span class="val">✅ مفعّل</span></div>`;
  }).join('');
  document.getElementById('profileCard').innerHTML = `
    ${u.profile_pic ? `<img src="${u.profile_pic}" class="avatar" alt="">` : `<div class="avatarPh">👤</div>`}
       <input type="file" accept="image/*" id="picInput" class="hidden" onchange="pickPic(this); document.getElementById('picName').textContent = this.files[0] ? '✅ ' + this.files[0].name : 'لم يتم اختيار صورة بعد';">
    <button onclick="document.getElementById('picInput').click()" style="background:#1e3a8a;color:#fff;border:none;padding:9px 24px;border-radius:10px;font-family:Cairo;font-weight:700;cursor:pointer;">📸 تغيير صورتي</button>
    <div id="picName" style="font-size:12px;color:#94a3b8;margin-bottom:15px;">لم يتم اختيار صورة بعد</div>
    <div style="font-size:12px;color:#94a3b8;margin-bottom:15px;">محاولاتك المتبقية للتراكم: <b style="color:${u.attempts_left>1?'#059669':'#dc2626'}">${u.attempts_left ?? 3}</b></div>
        <button onclick="openChangePass()" style="background:#1e3a8a;color:#fff;border:none;padding:10px 25px;border-radius:10px;font-family:Cairo;font-weight:700;cursor:pointer;margin-bottom:20px;">🔒 تغيير كلمة المرور</button>
    <div class="profileRow"><span class="lbl">الاسم</span><span class="val">${esc(u.first_name+' '+u.last_name)}</span></div>
    <div class="profileRow"><span class="lbl">رقم الهاتف</span><span class="val">${esc(u.phone)}</span></div>
    <div class="profileRow"><span class="lbl">هاتف ولي الأمر</span><span class="val">${esc(u.parent_phone)}</span></div>
    <div class="profileRow"><span class="lbl">البريد الإلكتروني</span><span class="val">${esc(u.email)}</span></div>
    <div class="profileRow"><span class="lbl">السنة الدراسية</span><span class="val">${esc(u.grade)}</span></div>
    <div class="profileRow"><span class="lbl">النوع</span><span class="val">${esc(u.gender)}</span></div>
    ${enrolls?'<h3 style="margin:20px 0 5px;color:#1e3a8a;text-align:right;">اشتراكاتي:</h3>'+enrolls:''}
    ${myBooks?'<h3 style="margin:20px 0 5px;color:#1e3a8a;text-align:right;">كتبي:</h3>'+myBooks:''}`;
  const hp = document.getElementById('headerPic');
  if(u.profile_pic) hp.src = u.profile_pic;
}

function pickPic(input){
  const file = input.files[0];
  if(!file) return;
  const rd = new FileReader();
  rd.onload = e => {
    const img = new Image();
    img.onload = async () => {
      const c = document.createElement('canvas');
      c.width = 300; c.height = 300;
      const min = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width-min)/2, (img.height-min)/2, min, min, 0, 0, 300, 300);
      const data = c.toDataURL('image/jpeg', .75);
      const r = await fetch('/api/upload-pic',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({pic:data})});
      const d = await r.json();
      if(d.ok) renderProfile();
      else alert(d.msg || 'فشل رفع الصورة');
    };
    img.src = e.target.result;
  };
  rd.readAsDataURL(file);
}

let allBooks = [];

async function loadBooks(){
  allBooks = await fetch('/api/books').then(r=>r.json());
  document.getElementById('booksGrid').innerHTML = allBooks.length ? allBooks.map(b=>{
    const owned = (me.books||[]).some(x=>x.book_id===b.id);
    let bottom = '';
    if(owned){
      bottom = `<div class="unlockedBadge">✅ تفعيلك ساري</div>
        ${b.pdf_url?`<a class="pdfLink" href="${esc(b.pdf_url)}" target="_blank">⬇️ افتح الكتاب PDF</a>`:'<p style="font-size:12px;color:#94a3b8;margin-top:8px;">الملف هيضاف قريب</p>'}`;
    } else {
      bottom = `<div class="codeArea">
          <label>عندك رمز التفعيل؟</label>
          <div class="codeRow">
            <input id="bcode-${b.id}" placeholder="رمز الكتاب">
            <button onclick="activateBook(${b.id})">تفعيل</button>
          </div>
          <div class="codeMsg" id="bmsg-${b.id}"></div>
        </div>
        <button class="btnSub" style="margin-top:15px;" onclick="buyBook(${b.id})">💰 شراء الكتاب</button>`;
    }
    return `<div class="courseCard">
      <div class="courseImg" style="background:linear-gradient(135deg,#d97706,#92400e)">${b.emoji||'📖'}</div>
      <div class="courseBody">
        <h3>${esc(b.title)}</h3>
        <p class="desc">${esc(b.description||'')}</p>
        <div class="price">${b.price} جنيه</div>
        ${bottom}
      </div>
    </div>`;
  }).join('') : '<div class="noReply">مفيش كتب متاحة لسه</div>';
}

function buyBook(id){
  const b = allBooks.find(x=>x.id===id);
  window.open(waLink(`أنا ${me.user.first_name} أريد شراء كتاب ${b.title}`));
}

async function activateBook(bookId){
  const msg = document.getElementById('bmsg-'+bookId);
  const code = document.getElementById('bcode-'+bookId).value.trim();
  const r = await fetch('/api/activate-book',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({bookId, code})});
  const d = await r.json();
  if(d.ok){ msg.style.color='#166534'; msg.textContent='✅ تم تفعيل الكتاب!'; setTimeout(()=>{loadBooks();renderProfile();},900); }
  else { msg.style.color='#b91c1c'; msg.textContent='❌ '+esc(d.msg); }
}

async function loadCourses(){
  const [cs, m] = await Promise.all([
    fetch('/api/courses').then(r=>r.json()),
    fetch('/api/me').then(r=>r.json())
  ]);
  courses = cs; me = m;
  renderProfile();
  document.getElementById('coursesGrid').innerHTML = courses.map(c=>{
    const enr = me.enrollments.find(e=>e.course_id===c.id);
    const active = enr && new Date(enr.expires_at) > new Date();
    const expired = enr && !active;
    let bottom = '';
    if(active){
      bottom = `<div class="unlockedBadge">✅ أنت مشترك — الاشتراك ساري</div>
        <button class="btnEnter" onclick="openCourse(${c.id})">🚀 ادخل الكورس</button>`;
    } else if(expired){
      bottom = `<div class="expiredBadge">⌛ انتهى شهر الاشتراك — كلم المدير للتجديد</div>`;
    } else {
      bottom = `<div class="codeArea">
          <label>عندك رمز؟ اكتبه هنا بعد ما تدفع:</label>
          <div class="codeRow">
            <input id="code-${c.id}" placeholder="رمز الدخول">
            <button onclick="activate(${c.id})">تفعيل</button>
          </div>
          <div class="codeMsg" id="msg-${c.id}"></div>
        </div>
        <button class="btnSub" style="margin-top:15px;" onclick="subscribeCourse(${c.id})">💰 الاشتراك في الكورس</button>`;
    }
    return `<div class="courseCard">
      <div class="courseImg" style="background:${c.color}">${c.emoji}</div>
      <div class="courseBody">
        <h3>${esc(c.name)}</h3>
        <p class="desc">${esc(c.description)}</p>
        <div class="price">${c.price} جنيه</div>
        ${bottom}
      </div>
    </div>`;
  }).join('');
}

function subscribeCourse(id){
  const c = courses.find(x=>x.id===id);
  window.open(waLink(`أنا ${me.user.first_name} أريد الاشتراك في كورس ${c.name}`));
}

function whatsappGeneral(){
  window.open(waLink(`أنا ${me.user.first_name} أريد الاستفسار عن الدفع والاشتراكات`));
}

async function activate(courseId){
  const msg = document.getElementById('msg-'+courseId);
  const code = document.getElementById('code-'+courseId).value.trim();
  const r = await fetch('/api/activate',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({courseId, code})});
  const d = await r.json();
  if(d.ok){ msg.style.color='#166534'; msg.textContent='✅ تم التفعيل! الكورس اتفتح'; setTimeout(loadCourses,900); }
  else { msg.style.color='#b91c1c'; msg.textContent='❌ '+esc(d.msg); }
}

function lessonHTML(l, viewed){
  let media = `<div class="videoBox"><div class="icon">🎬</div>مكان الفيديو — هيتضاف قريب</div>`;
  if(l.video_url){
    const m = l.video_url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
    if(m) media = `<iframe width="100%" height="380" src="https://www.youtube.com/embed/${m[1]}"
      frameborder="0" allowfullscreen style="border:none;border-radius:12px;"></iframe>`;
    else media = `<video controls style="width:100%;border-radius:12px;"><source src="${esc(l.video_url)}"></video>`;
  }
  return `<div class="lesson">
    <h4>${viewed?'<span class="watchBadge">✅ تم السماع</span> — ':''}${esc(l.title)}</h4>
    <div id="vw-${l.id}" class="videoWrap hidden">${media}${l.description?'<p>'+esc(l.description)+'</p>':''}</div>
    <button class="btnLesson" id="btn-${l.id}" onclick="openLesson(${l.id}, ${viewed?1:0})">▶️ افتح الدرس</button>
  </div>`;
}

async function openLesson(id, already){
  document.getElementById('vw-'+id).classList.remove('hidden');
  document.getElementById('btn-'+id).classList.add('hidden');
  if(!already){
    await fetch('/api/lesson-viewed',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({lesson_id:id})});
    if(!currentViewed.includes(id)) currentViewed.push(id);
    renderLessons();
  }
}

function renderLessons(){
  const box = document.getElementById('cpLessons');
  const total = courseData.length;
  const done = courseData.filter(l=>currentViewed.includes(l.id)).length;
  const pct = total ? Math.round(done/total*100) : 0;
  box.innerHTML = `<div style="margin-bottom:15px;font-weight:700;color:#1e3a8a;text-align:center;">
      أنت سمّعت ${done} من ${total} درس (${pct}%)</div>
    <div class="progressBar"><div style="width:${pct}%"></div></div>` +
    (courseData.length ? courseData.map(l=>lessonHTML(l, currentViewed.includes(l.id))).join('')
      : '<div class="noReply">مفيش دروس لسه</div>');
}

function cpTab(t){
  ['lessons','exam','honor'].forEach(x=>{
    document.getElementById('cpTab-'+x).classList.toggle('active', x===t);
    document.getElementById('cp'+x.charAt(0).toUpperCase()+x.slice(1)).classList.toggle('hidden', x!==t);
  });
  if(t==='exam') loadExam();
  if(t==='honor') loadHonor();
}

let courseData = [];

async function openCourse(id){
  currentCourse = id;
  const r = await fetch('/api/course/'+id);
  if(!r.ok){ const d = await r.json(); alert(d.error); return; }
  const d = await r.json();
  const c = courses.find(x=>x.id===id);
  document.getElementById('cpTitle').textContent = c.name;
  courseData = d.lessons;
  currentViewed = d.viewed || [];
  renderLessons();
  document.getElementById('coursePage').classList.remove('hidden');
  cpTab('lessons');
  window.scrollTo(0,0);
}

function closeCourse(){
  clearInterval(timerInt); clearInterval(examInt);
  document.getElementById('coursePage').classList.add('hidden');
  loadCourses();
}

const typeNames = {mcq:'اختيار من متعدد', truefalse:'صح وغلط', order:'ترتيب', essay:'مقالي'};

async function loadExam(){
  const box = document.getElementById('cpExam');
  box.innerHTML = '<div class="noReply">جاري التحميل...</div>';
  const r = await fetch('/api/exam/'+currentCourse);
  examData = await r.json();
  if(examData.status==='none'){
    box.innerHTML = '<div class="noReply">مفيش امتحان متاح في الكورس ده حاليًا</div>'; return;
  }
  if(examData.status==='closed'){
    box.innerHTML = '<div class="noReply">🔒 الامتحان مقفول حاليًا — استنى إعلان المدير</div>'; return;
  }
  if(examData.status==='results'){
    box.innerHTML = `<div class="noReply">📊 نتائج الامتحان ظهرت في <b>لوحة الشرف 🏆</b> — انتقل ليها من فوق!</div>`; return;
  }
  if(examData.status==='submitted'){
    box.innerHTML = `<div class="examIntro"><h3>✅ سلمت الامتحان</h3>
      <p>درجتك الحالية: <b>${examData.score}</b>${examData.essayPending?'<br><small style="color:#d97706;">فيه سؤال مقالي هيصححه المدير — الدرجة النهائية تظهر في لوحة الشرف</small>':''}</p></div>`;
    return;
  }
  examAnswers = {}; examStart = Date.now();
  box.innerHTML = `
    <div class="examIntro" style="margin-bottom:20px;">
      <h3>📝 ${esc(examData.examTitle)}</h3>
      <p>مدة الامتحان: <b>${examData.duration} دقيقة</b> — بمجرد ما تدوس "بدأ" العداد هيبدأ ومش هيتوقف!</p>
      <p style="color:#b91c1c;font-weight:700;">سلم مرة واحدة بس — مفيش رجوع!</p>
      <button class="btnMain" style="max-width:250px;" onclick="beginExam()">🚀 بدأ الامتحان</button>
    </div>
    <div id="examQuestions" class="hidden"></div>`;
}

function beginExam(){
  document.getElementById('examQuestions').classList.remove('hidden');
  renderExamQuestions();
  let left = examData.duration * 60;
  const tEl = document.getElementById('cpTitle');
  examInt = setInterval(()=>{
    left--;
    if(left<=0){ clearInterval(examInt); submitExam(true); return; }
    const m=Math.floor(left/60), s=left%60;
    if(tEl) tEl.textContent = '⏰ ' + m + ':' + String(s).padStart(2,'0');
  }, 1000);
  window.scrollTo(0,0);
}

function renderExamQuestions(){
  const box = document.getElementById('examQuestions');
  box.innerHTML = examData.questions.map((q,i)=>{
    let body = '';
    if(q.type==='mcq'){
      body = (q.options||[]).map((op,j)=>
        `<div class="optRow" onclick="pick(${q.id},'${esc(String.fromCharCode(65+j))}',this)">
          <input type="radio" name="q${q.id}"><span>${esc(op)}</span></div>`).join('');
    } else if(q.type==='truefalse'){
      body = `<div class="optRow" onclick="pick(${q.id},'صح',this)"><input type="radio" name="q${q.id}"><span>✅ صح</span></div>
              <div class="optRow" onclick="pick(${q.id},'غلط',this)"><input type="radio" name="q${q.id}"><span>❌ غلط</span></div>`;
    } else if(q.type==='order'){
      body = `<div id="ord-${q.id}">` + (q.items||[]).map((it,j)=>
        `<div class="ordRow" draggable="true" ondragstart="dragS(event)" ondragover="event.preventDefault()"
          ondrop="dropOrd(event,'${q.id}')"><span class="num">${j+1}</span><span>${esc(it)}</span></div>`).join('') + `</div>
        <small style="color:#94a3b8;">اسحب العناصر لإعادة ترتيبها (الأول فوق)</small>`;
    } else if(q.type==='essay'){
      body = `<textarea class="essayTa" oninput="examAnswers[${q.id}]=examAnswers[${q.id}]||{}; examAnswers[${q.id}].value=this.value"
        placeholder="اكتب إجابتك هنا..."></textarea>`;
    }
    return `<div class="qCard">
      <span class="qNum">سؤال ${i+1} — ${q.points} درجة</span><span class="qType">${typeNames[q.type]||''}</span>
      <h4>${esc(q.text)}</h4>
      ${body}
    </div>`;
  }).join('') + `<button class="btnSubmitExam" onclick="submitExam(false)">📨 تسليم الامتحان</button>`;
}

function pick(qid, val, el){
  examAnswers[qid] = {value: val};
  const card = el.closest('.qCard');
  card.querySelectorAll('.optRow').forEach(r=>r.classList.remove('sel'));
  el.classList.add('sel');
}

let dragEl = null;

function dragS(e){ dragEl = e.target; }

function dropOrd(e, qid){
  e.preventDefault();
  const cont = document.getElementById('ord-'+qid);
  if(!dragEl || !cont || dragEl.parentElement!==cont) return;
  const target = e.target.closest('.ordRow') || cont.lastElementChild;
  cont.insertBefore(dragEl, target === dragEl ? null : (target.nextElementSibling || null));
  if(target === dragEl) cont.insertBefore(dragEl, null);
  [...cont.children].forEach((r,i)=> r.querySelector('.num').textContent = i+1);
  examAnswers[qid] = {value: [...cont.children].map(r=>r.querySelector('span:last-child').textContent)};
}

async function submitExam(auto){
  if(!auto){
    const answered = Object.keys(examAnswers).length;
    if(!confirm(`متأكد من التسليم؟ جاوبت على ${answered} سؤال — مش هتقدر تعدل بعدها!`)) return;
  }
  clearInterval(examInt);
  const timeTaken = Math.floor((Date.now()-examStart)/1000);
  const r = await fetch('/api/exam/'+currentCourse+'/submit',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({answers: Object.entries(examAnswers).map(([qid,v])=>({qid:Number(qid), value:v.value})), time_taken: timeTaken})});
  const d = await r.json();
  if(d.ok){
    document.getElementById('cpExam').innerHTML = `<div class="examIntro"><h3>📨 اتسلم!</h3>
      <p>درجتك: <b>${d.score}</b>${d.essayPending?'<br><small style="color:#d97706;">فيه مقالي هيصححه المدير — النتيجة النهائية في لوحة الشرف</small>':''}</p></div>`;
  } else {
    alert(d.msg||'حصل خطأ');
    loadExam();
  }
}

async function loadHonor(){
  const box = document.getElementById('cpHonor');
  box.innerHTML = '<div class="noReply">جاري التحميل...</div>';
  const r = await fetch('/api/exam/'+currentCourse+'/honor');
  const d = await r.json();
  if(d.status!=='results'){
    box.innerHTML = '<div class="noReply">🏆 لوحة الشرف بتظهر لما المدير يعلن نتائج الامتحان</div>'; return;
  }
  const medals = ['🥇','🥈','🥉'];
  box.innerHTML = `<h3 style="text-align:center;color:#1e3a8a;margin-bottom:8px;">🏆 لوحة الشرف — ${esc(d.examTitle)}</h3>
    <p style="text-align:center;color:#64748b;margin-bottom:20px;font-size:13px;">الترتيب: أعلى درجة ← أقل وقت</p>
    <div class="podium">` + (d.results||[]).map((r,i)=>`
      <div class="honorRow ${i<3?'r'+(i+1):''}">
        <div class="rank">${medals[i]||('#'+(i+1))}</div>
        <div class="name">${esc(r.first_name+' '+r.last_name)}<small>${esc(r.grade||'')}</small></div>
        <div class="sc">${r.total} درجة${r.essay_pending?' ⏳':''}</div>
        <div class="tm">⏱ ${fmtTime(r.time_taken)}</div>
      </div>`).join('') + `</div>`;
}

async function sendSupport(){
  const t = document.getElementById('supportText').value.trim();
  if(!t) return document.getElementById('supportMsg').innerHTML='<div class="error">اكتب رسالتك الأول</div>';
  await fetch('/api/support',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:t})});
  document.getElementById('supportText').value='';
  document.getElementById('supportMsg').innerHTML='<div class="success">✅ وصلت رسالتك للإدارة</div>';
  loadReplies();
}

async function loadReplies(){
  const msgs = await fetch('/api/my-messages').then(r=>r.json());
  const withReply = msgs.filter(m=>m.reply);
  document.getElementById('repliesList').innerHTML = withReply.length
    ? withReply.map(m=>`<div class="replyCard">
        <div class="q"><b>رسالتك:</b> ${esc(m.text)}</div>
        <div class="a"><b>رد الدعم:</b> ${esc(m.reply)}</div></div>`).join('')
    : '<div class="noReply">مفيش ردود لسه</div>';
}
function openForgot(){
  const emailEl = document.getElementById('loginEmail');
  const email = emailEl ? emailEl.value.trim() : '';
  window.open('https://wa.me/201283674859?text=' + encodeURIComponent(
    'أنا ...\n' +
    'أريد تغيير كلمة المرور لأني نسيتها\n' +
    'هذا البريد المسجل به: ' + (email || '____ اكتب بريدك هنا ____') + '\n' +
    'هذا رقم الهاتف المسجل به: ____ اكتب رقمك هنا ____'
  ));
}

function openChangePass(){
  document.getElementById('passPanel').classList.remove('hidden');
  document.getElementById('passMsg').innerHTML='';
  document.getElementById('cpOld').value='';
  document.getElementById('cpNew').value='';
  document.getElementById('cpNew2').value='';
}
function closePassPanel(){ document.getElementById('passPanel').classList.add('hidden'); }
async function doChangePass(){
  const m = document.getElementById('passMsg');
  if(document.getElementById('cpNew').value !== document.getElementById('cpNew2').value){
    m.innerHTML='<div class="error">الجديدة والتأكيد مش متطابقين</div>'; return;
  }
  const r = await fetch('/api/change-password',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({old_pass:document.getElementById('cpOld').value, new_pass:document.getElementById('cpNew').value})});
  const d = await r.json();
  if(d.ok){
    m.innerHTML='<div class="success">✅ '+esc(d.msg)+'</div>';
    setTimeout(closePassPanel, 1500);
  } else m.innerHTML='<div class="error">'+esc(d.msg)+'</div>';
}
let sugPicData = null;
function openSuggest(){
  document.getElementById('suggestPanel').classList.remove('hidden');
  document.getElementById('sugMsg').innerHTML='';
  document.getElementById('sugText').value='';
  document.getElementById('sugPicName').textContent='';
  document.getElementById('sugPicPreview').classList.add('hidden');
  sugPicData = null;
}
function closeSuggest(){ document.getElementById('suggestPanel').classList.add('hidden'); }
function sugPick(input){
  const file = input.files[0];
  if(!file) return;
  const rd = new FileReader();
  rd.onload = e => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const max = 800;
      const scale = Math.min(1, max/Math.max(img.width, img.height));
      c.width = img.width*scale; c.height = img.height*scale;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      sugPicData = c.toDataURL('image/jpeg', .7);
      const pv = document.getElementById('sugPicPreview');
      pv.src = sugPicData; pv.classList.remove('hidden');
      document.getElementById('sugPicName').textContent = '✅ ' + file.name;
    };
    img.src = e.target.result;
  };
  rd.readAsDataURL(file);
}
async function sendSuggest(){
  const m = document.getElementById('sugMsg');
  const text = document.getElementById('sugText').value.trim();
  if(!text){ m.innerHTML='<div class="error">اكتب الاقتراح الأول</div>'; return; }
  const r = await fetch('/api/suggestion',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({text, pic:sugPicData})});
  const d = await r.json();
  if(d.ok){
    m.innerHTML='<div class="success">✅ وصل اقتراحك للإدارة — شكرًا لمساهمتك في تطوير المنصة!</div>';
    setTimeout(closeSuggest, 1800);
  } else m.innerHTML='<div class="error">'+esc(d.msg)+'</div>';
}
async function loadStudentsCount(){
  try {
    const d = await fetch('/api/stats').then(r=>r.json());
    const h = document.getElementById('studentsCount');
    if(h && d.students) h.textContent = d.students;
    const a = document.getElementById('authStudentsCount');
    if(a && d.students) a.textContent = d.students;
    const s = document.getElementById('subCount');
    if(s && d.students) s.textContent = d.students - 1;
  } catch(e){}
}window.onload = async ()=>{
  loadStudentsCount();
  const r = await fetch('/api/me');
  if(r.ok){ me = await r.json(); await loadCourses(); showApp(); }
};
