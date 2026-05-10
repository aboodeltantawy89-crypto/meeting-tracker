import { useState, useEffect, useRef } from 'react'
import * as db from './db'

const DAY_NAMES = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']

function getWeekLabel(offset = 0, meetingDay = 1, customDate = null) {
  if (customDate && offset === 0) {
    return `${DAY_NAMES[meetingDay]} ${customDate}`
  }
  const now = customDate ? new Date(customDate.split('/').reverse().join('-')) : new Date()
  const day = now.getDay()
  let diff = meetingDay - day
  const date = new Date(now)
  date.setDate(now.getDate() + diff + offset * 7)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${DAY_NAMES[meetingDay]} ${dd}/${mm}/${date.getFullYear()}`
}

const weekKey = (offset) => `week_${offset}`

export default function App() {
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [meetingDay, setMeetingDay] = useState(1)
  const [customDate, setCustomDate] = useState(null)   // 'dd/mm/yyyy' or null
  const [customDateInput, setCustomDateInput] = useState('')
  const [members, setMembers]   = useState([])
  const [tasks, setTasks]             = useState([])
  const [recurring, setRecurring]     = useState([])   // { id, member_id, text, done_this_week: {weekKey: bool} }
  const [newRecurring, setNewRecurring] = useState('')
  const [notes, setNotes]       = useState([])
  const [activeTab, setActiveTab]   = useState('')
  const [mainView, setMainView]     = useState('tasks')
  const [newTask, setNewTask]       = useState('')
  const [editingMember, setEditingMember] = useState(null)
  const [editNameVal, setEditNameVal]     = useState('')
  const [showWeekModal, setShowWeekModal]   = useState(false)
  const [showHistory, setShowHistory]       = useState(false)
  const [showMembersModal, setShowMembersModal] = useState(false)
  const [showDayModal, setShowDayModal]     = useState(false)
  const [newMemberName, setNewMemberName]   = useState('')
  const [confirmDelete, setConfirmDelete]   = useState(null)
  const noteTimers = useRef({})

  const wKey = weekKey(weekOffset)

  useEffect(() => {
    async function load() {
      try {
        const [offset, mems, allTasks, allNotes, savedDay, savedCustomDate, savedRecurring] = await Promise.all([
          db.getWeekOffset(),
          db.getMembers(),
          db.getAllTasks(),
          db.getAllNotes(),
          db.getSetting('meeting_day'),
          db.getSetting('custom_date'),
          db.getSetting('recurring_tasks'),
        ])
        setWeekOffset(offset)
        setMembers(mems)
        setTasks(allTasks)
        setNotes(allNotes)
        if (savedDay !== null) setMeetingDay(parseInt(savedDay))
        if (savedCustomDate) { setCustomDate(savedCustomDate); setCustomDateInput(savedCustomDate) }
        if (savedRecurring) { try { setRecurring(JSON.parse(savedRecurring)) } catch {} }
        setActiveTab(mems[0]?.id || '')
      } catch (e) {
        setError('تعذّر الاتصال بقاعدة البيانات. تحقق من إعدادات Supabase.')
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const weekTasks = tasks.filter(t => t.week_key === wKey)
  const getMemberTasks = (memberId, wk = wKey) =>
    tasks.filter(t => t.member_id === memberId && t.week_key === wk)

  const getMemberNote = (memberId, wk = wKey) =>
    notes.find(n => n.member_id === memberId && n.week_key === wk)?.content || ''
  const getGlobalNote = (wk = wKey) =>
    notes.find(n => n.member_id === null && n.week_key === wk)?.content || ''

  const setNoteLocal = (memberId, wk, content) => {
    setNotes(prev => {
      const idx = prev.findIndex(n => n.member_id === memberId && n.week_key === wk)
      if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], content }; return next }
      return [...prev, { member_id: memberId, week_key: wk, content }]
    })
  }

  const handleNoteChange = (memberId, content) => {
    setNoteLocal(memberId, wKey, content)
    const key = `${memberId}__${wKey}`
    clearTimeout(noteTimers.current[key])
    noteTimers.current[key] = setTimeout(() => db.upsertNote(memberId, wKey, content), 800)
  }

  const getMemberStats = (memberId, wk = wKey) => {
    const t = getMemberTasks(memberId, wk)
    return { total: t.length, done: t.filter(x => x.done).length }
  }
  const totalStats = members.reduce((acc, m) => {
    const s = getMemberStats(m.id)
    return { total: acc.total + s.total, done: acc.done + s.done }
  }, { total: 0, done: 0 })

  const addTask = async () => {
    if (!newTask.trim()) return
    const task = { id: Date.now(), member_id: activeTab, week_key: wKey, text: newTask.trim(), done: false }
    setTasks(prev => [...prev, task])
    setNewTask('')
    await db.insertTask(task)
  }

  const handleToggleTask = async (id, currentDone) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !currentDone } : t))
    await db.toggleTask(id, !currentDone)
  }

  const handleDeleteTask = async (id) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    await db.removeTask(id)
  }

  const advanceWeek = async () => {
    const nextOffset = weekOffset + 1
    const nextKey = weekKey(nextOffset)
    const incomplete = weekTasks
      .filter(t => !t.done)
      .map(t => ({ ...t, id: Date.now() + Math.random(), week_key: nextKey, done: false }))
    setTasks(prev => [...prev, ...incomplete])
    for (const t of incomplete) await db.insertTask(t)
    setWeekOffset(nextOffset)
    await db.setWeekOffset(nextOffset)
    setShowWeekModal(false)
  }

  const handleChangeMeetingDay = async (day) => {
    setMeetingDay(day)
    await db.setSetting('meeting_day', String(day))
  }

  const handleSaveCustomDate = async () => {
    // validate dd/mm/yyyy
    const parts = customDateInput.split('/')
    if (parts.length === 3 && parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length === 4) {
      setCustomDate(customDateInput)
      await db.setSetting('custom_date', customDateInput)
      setShowDayModal(false)
    }
  }

  const handleClearCustomDate = async () => {
    setCustomDate(null)
    setCustomDateInput('')
    await db.setSetting('custom_date', '')
    setShowDayModal(false)
  }

  // ── recurring tasks ──────────────────────────────────
  const getMemberRecurring = (memberId) => recurring.filter(r => r.member_id === memberId)

  const saveRecurring = async (newList) => {
    setRecurring(newList)
    await db.setSetting('recurring_tasks', JSON.stringify(newList))
  }

  const addRecurring = async () => {
    if (!newRecurring.trim()) return
    const item = { id: Date.now(), member_id: activeTab, text: newRecurring.trim(), done_this_week: {} }
    await saveRecurring([...recurring, item])
    setNewRecurring('')
  }

  const toggleRecurring = async (id) => {
    const updated = recurring.map(r => {
      if (r.id !== id) return r
      const done = { ...r.done_this_week, [wKey]: !r.done_this_week?.[wKey] }
      return { ...r, done_this_week: done }
    })
    await saveRecurring(updated)
  }

  const deleteRecurring = async (id) => {
    await saveRecurring(recurring.filter(r => r.id !== id))
  }

  const addMember = async () => {
    if (!newMemberName.trim()) return
    const id = `m_${Date.now()}`
    const newM = { id, name: newMemberName.trim(), sort_order: members.length }
    setMembers(prev => [...prev, newM])
    setNewMemberName('')
    setActiveTab(id)
    await db.addMember(id, newM.name, newM.sort_order)
  }

  const handleDeleteMember = async (id) => {
    const rem = members.filter(m => m.id !== id)
    setMembers(rem)
    setConfirmDelete(null)
    if (activeTab === id && rem.length > 0) setActiveTab(rem[0].id)
    await db.deleteMember(id)
    setTasks(prev => prev.filter(t => t.member_id !== id))
  }

  const saveEditName = async () => {
    if (!editNameVal.trim()) { setEditingMember(null); return }
    setMembers(prev => prev.map(m => m.id === editingMember ? { ...m, name: editNameVal.trim() } : m))
    await db.updateMemberName(editingMember, editNameVal.trim())
    setEditingMember(null)
  }

  const allWeekOffsets = [...new Set(tasks.map(t => parseInt(t.week_key.replace('week_', ''))))].sort((a, b) => b - a)
  const activeMember = members.find(m => m.id === activeTab)
  const notesCount = members.filter(m => getMemberNote(m.id).trim()).length + (getGlobalNote().trim() ? 1 : 0)

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0f1117', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Cairo',sans-serif", direction:'rtl' }}>
      <div style={{ textAlign:'center', color:'#4ade80' }}>
        <div style={{ fontSize:40, marginBottom:16, animation:'spin 1.2s linear infinite', display:'inline-block' }}>⟳</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ fontSize:16, fontWeight:700 }}>جاري التحميل...</div>
      </div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight:'100vh', background:'#0f1117', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Cairo',sans-serif", direction:'rtl', padding:24 }}>
      <div style={{ background:'#1c0a0a', border:'1px solid #7f1d1d', borderRadius:14, padding:32, maxWidth:420, textAlign:'center' }}>
        <div style={{ fontSize:36, marginBottom:14 }}>⚠️</div>
        <div style={{ fontSize:16, fontWeight:700, color:'#fca5a5', marginBottom:10 }}>خطأ في الاتصال</div>
        <div style={{ fontSize:13, color:'#ef4444', lineHeight:1.8 }}>{error}</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#0f1117', fontFamily:"'Cairo','Segoe UI',sans-serif", direction:'rtl', color:'#e8eaf0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:#0f1117}::-webkit-scrollbar-thumb{background:#1e3a2f;border-radius:4px}
        .tab-btn{transition:all .18s;cursor:pointer;border:none;outline:none}
        .tab-btn:hover{background:#161923 !important}
        .task-row{transition:background .12s}.task-row:hover{background:#1a1e2a !important}
        .del-btn{opacity:0;transition:opacity .12s;cursor:pointer;background:none;border:none}.task-row:hover .del-btn{opacity:1}
        .slide-in{animation:slideIn .22s ease both}@keyframes slideIn{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:translateX(0)}}
        .fade-in{animation:fadeIn .2s ease}@keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .progress-bar{transition:width .5s ease}
        input,button,textarea{font-family:'Cairo',sans-serif}
        .icon-btn{cursor:pointer;background:none;border:none;transition:opacity .15s}.icon-btn:hover{opacity:.65}
        .week-row{cursor:pointer;transition:background .12s;border-radius:9px}.week-row:hover{background:#161923 !important}
        .member-row{transition:background .12s;border-radius:9px}.member-row:hover{background:#161923 !important}
        .day-btn{cursor:pointer;border:none;transition:all .15s;border-radius:9px;padding:10px 0;font-family:'Cairo',sans-serif;font-size:14px;font-weight:600}
        .day-btn:hover{transform:scale(1.03)}
        @keyframes slidePanel{from{transform:translateX(-30px);opacity:0}to{transform:translateX(0);opacity:1}}
        .note-area{resize:none;width:100%;background:#0f1117;border:1px solid #1e2d40;border-radius:9px;padding:12px 14px;color:#cbd5e1;font-size:13px;line-height:1.8;direction:rtl;transition:border-color .2s}
        .note-area:focus{outline:none;border-color:#22c55e44}
        .note-area::placeholder{color:#2d3748}
        .view-toggle{cursor:pointer;border:none;transition:all .18s;border-radius:8px}
      `}</style>

      {/* HEADER */}
      <div style={{ background:'linear-gradient(135deg,#111827,#0d1f2d)', borderBottom:'1px solid #1a2744', padding:'13px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:19, fontWeight:900, color:'#4ade80' }}>📋 متابعة التكليفات</div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:2 }}>
            <span style={{ fontSize:12, color:'#64748b' }}>{getWeekLabel(weekOffset, meetingDay, customDate)}</span>
            <button onClick={() => setShowDayModal(true)} style={{ fontSize:10, color:'#475569', background:'#13161f', border:'1px solid #1e2d40', borderRadius:6, padding:'1px 8px', cursor:'pointer' }}>
              ✏️ تغيير اليوم
            </button>
          </div>
        </div>
        <div style={{ display:'flex', gap:7, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ background:'#0f1117', borderRadius:9, padding:'5px 12px', border:'1px solid #1a2744', textAlign:'center' }}>
            <div style={{ fontSize:10, color:'#475569' }}>الإنجاز</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#4ade80' }}>{totalStats.done}/{totalStats.total}</div>
            <div style={{ width:'100%', height:3, background:'#1a2744', borderRadius:4, marginTop:2 }}>
              <div className="progress-bar" style={{ height:'100%', borderRadius:4, width:totalStats.total?`${(totalStats.done/totalStats.total)*100}%`:'0%', background:'linear-gradient(90deg,#4ade80,#22c55e)' }} />
            </div>
          </div>
          <button onClick={() => setShowHistory(true)} style={{ background:'#1a2744', border:'1px solid #1e3a5f', color:'#94a3b8', borderRadius:8, padding:'7px 12px', cursor:'pointer', fontSize:13 }}>🕓 السجل</button>
          <button onClick={() => setShowMembersModal(true)} style={{ background:'#1a2744', border:'1px solid #1e3a5f', color:'#94a3b8', borderRadius:8, padding:'7px 12px', cursor:'pointer', fontSize:13 }}>👥 الأعضاء</button>
          <button onClick={() => setShowWeekModal(true)} style={{ background:'linear-gradient(135deg,#166534,#14532d)', border:'none', color:'#4ade80', borderRadius:8, padding:'7px 14px', cursor:'pointer', fontWeight:700, fontSize:13 }}>🗓 أسبوع جديد</button>
        </div>
      </div>

      {/* BODY */}
      <div style={{ display:'flex', height:'calc(100vh - 73px)' }}>
        {/* Sidebar */}
        <div style={{ width:185, background:'#0a0c14', borderLeft:'1px solid #14172a', overflowY:'auto', padding:'10px 7px', display:'flex', flexDirection:'column' }}>
          <div style={{ display:'flex', gap:4, margin:'0 0 10px', background:'#13161f', borderRadius:9, padding:4 }}>
            <button className="view-toggle" onClick={() => setMainView('tasks')} style={{ flex:1, padding:'5px 0', fontSize:12, fontWeight:mainView==='tasks'?700:400, background:mainView==='tasks'?'linear-gradient(135deg,#166534,#14532d)':'transparent', color:mainView==='tasks'?'#4ade80':'#475569', border:'none' }}>تكليفات</button>
            <button className="view-toggle" onClick={() => setMainView('notes')} style={{ flex:1, padding:'5px 0', fontSize:12, fontWeight:mainView==='notes'?700:400, background:mainView==='notes'?'linear-gradient(135deg,#1e3a5f,#0d2137)':'transparent', color:mainView==='notes'?'#60a5fa':'#475569', border:'none', position:'relative' }}>
              ملاحظات
              {notesCount > 0 && <span style={{ position:'absolute', top:2, left:2, width:7, height:7, borderRadius:'50%', background:'#60a5fa' }} />}
            </button>
          </div>
          <div style={{ fontSize:10, color:'#334155', padding:'0 7px 6px', letterSpacing:1 }}>الأعضاء ({members.length})</div>
          {members.map(member => {
            const s = getMemberStats(member.id)
            const isActive = activeTab === member.id
            const allDone = s.total > 0 && s.done === s.total
            const hasNote = getMemberNote(member.id).trim().length > 0
            return (
              <button key={member.id} className="tab-btn" onClick={() => setActiveTab(member.id)} style={{ width:'100%', padding:'8px 9px', marginBottom:3, borderRadius:8, textAlign:'right', background:isActive?(mainView==='notes'?'linear-gradient(135deg,#1e3a5f,#0d2137)':'linear-gradient(135deg,#166534,#14532d)'):'transparent', border:isActive?(mainView==='notes'?'1px solid #60a5fa33':'1px solid #22c55e33'):'1px solid transparent', color:isActive?(mainView==='notes'?'#60a5fa':'#4ade80'):allDone?'#22c55e':'#94a3b8', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:13, fontWeight:isActive?700:400 }}>
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:105 }}>{member.name}</span>
                <div style={{ display:'flex', gap:4, alignItems:'center', flexShrink:0 }}>
                  {mainView==='notes' && hasNote && <span style={{ width:6, height:6, borderRadius:'50%', background:'#60a5fa', display:'inline-block' }} />}
                  {mainView==='tasks' && <span style={{ fontSize:10, background:allDone?'#166534':isActive?'#0d2b1a':'#13161f', color:allDone?'#4ade80':'#475569', borderRadius:20, padding:'1px 6px' }}>{s.done}/{s.total}</span>}
                </div>
              </button>
            )
          })}
          {mainView === 'notes' && (
            <button className="tab-btn" onClick={() => setActiveTab('__global__')} style={{ width:'100%', padding:'8px 9px', marginTop:6, borderRadius:8, textAlign:'right', background:activeTab==='__global__'?'linear-gradient(135deg,#1e3a5f,#0d2137)':'transparent', border:activeTab==='__global__'?'1px solid #60a5fa33':'1px solid #1a2744', color:activeTab==='__global__'?'#60a5fa':'#475569', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12 }}>
              <span>📌 ملاحظات عامة</span>
              {getGlobalNote().trim() && <span style={{ width:6, height:6, borderRadius:'50%', background:'#60a5fa', display:'inline-block' }} />}
            </button>
          )}
        </div>

        {/* Main */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 22px' }}>
          {mainView === 'tasks' && activeMember && (
            <>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                <div style={{ width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg,#166534,#0d2b1a)', border:'2px solid #22c55e22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:700, color:'#4ade80', flexShrink:0 }}>{activeMember.name.charAt(0)}</div>
                {editingMember === activeTab ? (
                  <div style={{ display:'flex', gap:7, alignItems:'center' }}>
                    <input value={editNameVal} onChange={e => setEditNameVal(e.target.value)} onKeyDown={e => e.key==='Enter' && saveEditName()} style={{ background:'#13161f', border:'1px solid #22c55e', borderRadius:7, padding:'4px 9px', color:'#e8eaf0', fontSize:13 }} autoFocus />
                    <button onClick={saveEditName} style={{ background:'#166534', border:'none', color:'#4ade80', borderRadius:6, padding:'4px 11px', cursor:'pointer' }}>حفظ</button>
                    <button onClick={() => setEditingMember(null)} style={{ background:'#1a1d2e', border:'none', color:'#64748b', borderRadius:6, padding:'4px 9px', cursor:'pointer' }}>إلغاء</button>
                  </div>
                ) : (
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    <span style={{ fontSize:17, fontWeight:700 }}>{activeMember.name}</span>
                    <button className="icon-btn" onClick={() => { setEditingMember(activeTab); setEditNameVal(activeMember.name) }} style={{ fontSize:13, color:'#334155' }}>✏️</button>
                  </div>
                )}
              </div>
              <div style={{ display:'flex', gap:8, marginBottom:14, background:'#13161f', borderRadius:9, padding:9, border:'1px solid #1a1d2e' }}>
                <input value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => e.key==='Enter' && addTask()} placeholder="أضف تكليفاً جديداً..." style={{ flex:1, background:'#0f1117', border:'1px solid #1e2d40', borderRadius:7, padding:'8px 11px', color:'#e8eaf0', fontSize:13, direction:'rtl' }} />
                <button onClick={addTask} style={{ background:'#166534', border:'none', color:'#4ade80', borderRadius:7, padding:'8px 16px', cursor:'pointer', fontWeight:700, fontSize:13 }}>+ إضافة</button>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {getMemberTasks(activeTab).length === 0 ? (
                  <div style={{ textAlign:'center', padding:'50px 20px', color:'#1e293b', fontSize:14 }}><div style={{ fontSize:34, marginBottom:10 }}>📝</div>لا توجد تكليفات لهذا الأسبوع</div>
                ) : getMemberTasks(activeTab).map((task, idx) => (
                  <div key={task.id} className="task-row slide-in" style={{ background:'#13161f', borderRadius:8, border:task.done?'1px solid #166534':'1px solid #1a1d2e', padding:'10px 13px', display:'flex', alignItems:'center', gap:10, animationDelay:`${idx*.04}s` }}>
                    <div onClick={() => handleToggleTask(task.id, task.done)} style={{ width:19, height:19, borderRadius:5, cursor:'pointer', flexShrink:0, border:task.done?'none':'2px solid #2d3748', background:task.done?'linear-gradient(135deg,#22c55e,#16a34a)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .15s' }}>
                      {task.done && <span style={{ color:'#fff', fontSize:11 }}>✓</span>}
                    </div>
                    <span style={{ flex:1, fontSize:13, color:task.done?'#334155':'#cbd5e1', textDecoration:task.done?'line-through':'none' }}>{task.text}</span>
                    {!task.done && <span style={{ fontSize:10, color:'#1e293b', background:'#13161f', borderRadius:20, padding:'1px 7px', border:'1px solid #1e293b' }}>معلّق</span>}
                    <button className="del-btn" onClick={() => handleDeleteTask(task.id)} style={{ color:'#ef4444', fontSize:15 }}>×</button>
                  </div>
                ))}
              </div>
            </>
          )}

          {mainView === 'notes' && (
            <div className="slide-in">
              {activeTab === '__global__' ? (
                <>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                    <div style={{ width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg,#1e3a5f,#0d2137)', border:'2px solid #60a5fa22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>📌</div>
                    <div>
                      <div style={{ fontSize:17, fontWeight:700, color:'#60a5fa' }}>ملاحظات عامة</div>
                      <div style={{ fontSize:11, color:'#475569', marginTop:1 }}>محفوظة على السيرفر • تظهر لكل الأجهزة</div>
                    </div>
                  </div>
                  <textarea className="note-area" rows={18} placeholder="اكتب ملاحظاتك العامة هنا..." value={getGlobalNote()} onChange={e => handleNoteChange(null, e.target.value)} />
                  <div style={{ fontSize:11, color:'#1e293b', marginTop:8, textAlign:'left' }}>{getGlobalNote().trim()?`${getGlobalNote().length} حرف • محفوظ تلقائياً`:'ابدأ الكتابة...'}</div>
                </>
              ) : activeMember ? (
                <>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                    <div style={{ width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg,#1e3a5f,#0d2137)', border:'2px solid #60a5fa22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:700, color:'#60a5fa', flexShrink:0 }}>{activeMember.name.charAt(0)}</div>
                    <div>
                      <div style={{ fontSize:17, fontWeight:700 }}>{activeMember.name}</div>
                      <div style={{ fontSize:11, color:'#475569', marginTop:1 }}>ملاحظات • {getWeekLabel(weekOffset, meetingDay, customDate)}</div>
                    </div>
                  </div>
                  <textarea className="note-area" rows={14} placeholder={`ملاحظات خاصة بـ ${activeMember.name}...`} value={getMemberNote(activeTab)} onChange={e => handleNoteChange(activeTab, e.target.value)} />
                  <div style={{ fontSize:11, color:'#1e293b', marginTop:8, textAlign:'left' }}>{getMemberNote(activeTab).trim()?`${getMemberNote(activeTab).length} حرف • محفوظ تلقائياً`:'ابدأ الكتابة...'}</div>
                  {getMemberTasks(activeTab).length > 0 && (
                    <div style={{ marginTop:18, background:'#13161f', borderRadius:9, padding:14, border:'1px solid #1a1d2e' }}>
                      <div style={{ fontSize:12, color:'#475569', marginBottom:8, display:'flex', justifyContent:'space-between' }}>
                        <span>تكليفات هذا الأسبوع</span>
                        <span style={{ color:'#4ade80' }}>{getMemberStats(activeTab).done}/{getMemberStats(activeTab).total}</span>
                      </div>
                      {getMemberTasks(activeTab).map(t => (
                        <div key={t.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:'1px solid #1a1d2e' }}>
                          <span style={{ fontSize:11, color:t.done?'#22c55e':'#ef4444' }}>{t.done?'✓':'○'}</span>
                          <span style={{ fontSize:12, color:t.done?'#334155':'#94a3b8', textDecoration:t.done?'line-through':'none' }}>{t.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
          {/* ── RECURRING TASKS ── */}
          {mainView === 'tasks' && activeMember && (
            <div style={{ marginTop:28 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                <div style={{ width:3, height:18, background:'linear-gradient(#a78bfa,#7c3aed)', borderRadius:4 }} />
                <span style={{ fontSize:14, fontWeight:700, color:'#a78bfa' }}>تكليفات متكررة</span>
                <span style={{ fontSize:10, color:'#4c1d95', background:'#1e1b4b', border:'1px solid #4c1d9566', borderRadius:20, padding:'1px 8px' }}>تترحل كل أسبوع تلقائياً</span>
              </div>

              {/* add recurring */}
              <div style={{ display:'flex', gap:8, marginBottom:12, background:'#13161f', borderRadius:9, padding:9, border:'1px solid #1e1b4b' }}>
                <input
                  value={newRecurring}
                  onChange={e => setNewRecurring(e.target.value)}
                  onKeyDown={e => e.key==='Enter' && addRecurring()}
                  placeholder="أضف تكليفاً متكرراً..."
                  style={{ flex:1, background:'#0f1117', border:'1px solid #2d2060', borderRadius:7, padding:'8px 11px', color:'#e8eaf0', fontSize:13, direction:'rtl' }}
                />
                <button onClick={addRecurring} style={{ background:'linear-gradient(135deg,#5b21b6,#4c1d95)', border:'none', color:'#c4b5fd', borderRadius:7, padding:'8px 16px', cursor:'pointer', fontWeight:700, fontSize:13 }}>+ إضافة</button>
              </div>

              {getMemberRecurring(activeTab).length === 0 ? (
                <div style={{ textAlign:'center', padding:'24px 20px', color:'#2d2060', fontSize:13 }}>
                  <div style={{ fontSize:26, marginBottom:6 }}>🔁</div>لا توجد تكليفات متكررة
                </div>
              ) : getMemberRecurring(activeTab).map((r, idx) => {
                const isDone = r.done_this_week?.[wKey] || false
                return (
                  <div key={r.id} className="task-row slide-in" style={{ background:'#0f0d1a', borderRadius:8, border:isDone?'1px solid #5b21b6':'1px solid #1e1b4b', padding:'10px 13px', display:'flex', alignItems:'center', gap:10, marginBottom:6, animationDelay:`${idx*.04}s` }}>
                    <div onClick={() => toggleRecurring(r.id)} style={{ width:19, height:19, borderRadius:5, cursor:'pointer', flexShrink:0, border:isDone?'none':'2px solid #4c1d95', background:isDone?'linear-gradient(135deg,#7c3aed,#5b21b6)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .15s' }}>
                      {isDone && <span style={{ color:'#fff', fontSize:11 }}>✓</span>}
                    </div>
                    <span style={{ flex:1, fontSize:13, color:isDone?'#4c1d95':'#c4b5fd', textDecoration:isDone?'line-through':'none' }}>{r.text}</span>
                    <span style={{ fontSize:10, color:'#4c1d95', background:'#1e1b4b', borderRadius:20, padding:'1px 8px', border:'1px solid #2d2060', flexShrink:0 }}>🔁</span>
                    <button className="del-btn" onClick={() => deleteRecurring(r.id)} style={{ color:'#ef4444', fontSize:15 }}>×</button>
                  </div>
                )
              })}
            </div>
          )}

          {!activeMember && mainView === 'tasks' && (
            <div style={{ textAlign:'center', padding:'80px 20px', color:'#334155' }}><div style={{ fontSize:38, marginBottom:12 }}>👥</div>أضف عضواً للبدء</div>
          )}
        </div>
      </div>

      {/* ── MEETING DAY MODAL ── */}
      {showDayModal && (
        <div className="fade-in" onClick={e => e.target===e.currentTarget && setShowDayModal(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'#0d0f1a', borderRadius:14, padding:24, border:'1px solid #1a2744', maxWidth:360, width:'90%', display:'flex', flexDirection:'column', gap:18 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:16, fontWeight:700 }}>📅 إعدادات الاجتماع</div>
              <button className="icon-btn" onClick={() => setShowDayModal(false)} style={{ fontSize:20, color:'#475569' }}>×</button>
            </div>

            {/* Day picker */}
            <div>
              <div style={{ fontSize:12, color:'#475569', marginBottom:10 }}>يوم الاجتماع الأسبوعي</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
                {DAY_NAMES.map((name, idx) => (
                  <button key={idx} className="day-btn" onClick={() => handleChangeMeetingDay(idx)} style={{ background: meetingDay === idx ? 'linear-gradient(135deg,#166534,#14532d)' : '#13161f', color: meetingDay === idx ? '#4ade80' : '#94a3b8', border: meetingDay === idx ? '1px solid #22c55e44' : '1px solid #1a1d2e' }}>
                    {meetingDay === idx && <span style={{ marginLeft:4, fontSize:11 }}>✓ </span>}{name}
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div style={{ borderTop:'1px solid #1a2744' }} />

            {/* Custom date */}
            <div>
              <div style={{ fontSize:12, color:'#475569', marginBottom:10 }}>أو حدد تاريخ الاجتماع القادم يدوياً</div>
              <div style={{ display:'flex', gap:8 }}>
                <input
                  value={customDateInput}
                  onChange={e => setCustomDateInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveCustomDate()}
                  placeholder="يوم/شهر/سنة  مثال: 15/06/2025"
                  style={{ flex:1, background:'#0f1117', border:'1px solid #1e2d40', borderRadius:7, padding:'8px 11px', color:'#e8eaf0', fontSize:13, direction:'rtl' }}
                />
                <button onClick={handleSaveCustomDate} style={{ background:'#166534', border:'none', color:'#4ade80', borderRadius:7, padding:'8px 14px', cursor:'pointer', fontWeight:700, fontSize:13 }}>حفظ</button>
              </div>
              {customDate && (
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10, background:'#0d2b1a', borderRadius:8, padding:'8px 12px', border:'1px solid #22c55e22' }}>
                  <span style={{ fontSize:12, color:'#4ade80' }}>📌 التاريخ الحالي: {customDate}</span>
                  <button onClick={handleClearCustomDate} style={{ background:'none', border:'none', color:'#475569', cursor:'pointer', fontSize:12 }}>× إلغاء</button>
                </div>
              )}
              <div style={{ fontSize:11, color:'#334155', marginTop:8 }}>لو حددت تاريخ يدوي هيظهر بدل الحساب التلقائي للأسبوع الحالي فقط</div>
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY PANEL ── */}
      {showHistory && (
        <div className="fade-in" onClick={e => e.target===e.currentTarget && setShowHistory(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.72)', display:'flex', alignItems:'flex-start', justifyContent:'flex-end', zIndex:1000 }}>
          <div style={{ width:400, height:'100vh', background:'#0d0f1a', borderRight:'1px solid #1a2744', overflowY:'auto', padding:22, animation:'slidePanel .25s ease' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div style={{ fontSize:16, fontWeight:700 }}>🕓 سجل الاجتماعات</div>
              <button className="icon-btn" onClick={() => setShowHistory(false)} style={{ fontSize:20, color:'#475569' }}>×</button>
            </div>
            {allWeekOffsets.length === 0 ? (
              <div style={{ color:'#334155', textAlign:'center', marginTop:60, fontSize:14 }}>لا توجد اجتماعات سابقة بعد</div>
            ) : allWeekOffsets.map(offset => {
              const wk = weekKey(offset)
              const isCurrent = offset === weekOffset
              const ws = members.reduce((acc, m) => { const t = getMemberTasks(m.id, wk); return { total:acc.total+t.length, done:acc.done+t.filter(x=>x.done).length } }, { total:0, done:0 })
              const pct = ws.total ? Math.round((ws.done/ws.total)*100) : 0
              return (
                <div key={offset} className="week-row" onClick={() => { setWeekOffset(offset); db.setWeekOffset(offset); setShowHistory(false) }} style={{ padding:'13px 15px', marginBottom:7, background:isCurrent?'#0d2b1a':'#13161f', border:isCurrent?'1px solid #22c55e33':'1px solid #1a1d2e' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:isCurrent?'#4ade80':'#94a3b8', display:'flex', alignItems:'center', gap:6 }}>
                        {getWeekLabel(offset, meetingDay, offset === weekOffset ? customDate : null)}
                        {isCurrent && <span style={{ fontSize:9, color:'#22c55e', background:'#0d2b1a', border:'1px solid #22c55e33', borderRadius:20, padding:'1px 7px' }}>الحالي</span>}
                      </div>
                      <div style={{ fontSize:11, color:'#475569', marginTop:3 }}>{ws.done}/{ws.total} تكليف • {pct}%</div>
                    </div>
                    <div style={{ width:48, height:48, position:'relative', flexShrink:0 }}>
                      <svg viewBox="0 0 36 36" style={{ width:48, height:48, transform:'rotate(-90deg)' }}>
                        <circle cx="18" cy="18" r="14" fill="none" stroke="#1a2744" strokeWidth="3"/>
                        <circle cx="18" cy="18" r="14" fill="none" stroke={pct===100?'#22c55e':'#4ade80'} strokeWidth="3" strokeDasharray={`${pct*.879} 87.9`} strokeLinecap="round"/>
                      </svg>
                      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#4ade80' }}>{pct}%</div>
                    </div>
                  </div>
                  <div style={{ marginTop:9, display:'flex', flexWrap:'wrap', gap:4 }}>
                    {members.map(m => { const s = getMemberStats(m.id, wk); if (!s.total) return null; const done = s.done===s.total; return <span key={m.id} style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:done?'#0d2b1a':'#1a1d2e', color:done?'#4ade80':'#64748b', border:`1px solid ${done?'#22c55e22':'#1e293b'}` }}>{m.name} {s.done}/{s.total}</span> })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── MEMBERS MODAL ── */}
      {showMembersModal && (
        <div className="fade-in" onClick={e => e.target===e.currentTarget && setShowMembersModal(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'#0d0f1a', borderRadius:14, padding:24, border:'1px solid #1a2744', width:400, maxHeight:'80vh', display:'flex', flexDirection:'column', gap:13 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:16, fontWeight:700 }}>👥 إدارة الأعضاء</div>
              <button className="icon-btn" onClick={() => { setShowMembersModal(false); setConfirmDelete(null); setEditingMember(null) }} style={{ fontSize:20, color:'#475569' }}>×</button>
            </div>
            <div style={{ display:'flex', gap:7 }}>
              <input value={newMemberName} onChange={e => setNewMemberName(e.target.value)} onKeyDown={e => e.key==='Enter' && addMember()} placeholder="اسم العضو الجديد..." style={{ flex:1, background:'#13161f', border:'1px solid #1e2d40', borderRadius:7, padding:'8px 11px', color:'#e8eaf0', fontSize:13, direction:'rtl' }} />
              <button onClick={addMember} style={{ background:'#166534', border:'none', color:'#4ade80', borderRadius:7, padding:'8px 14px', cursor:'pointer', fontWeight:700, fontSize:13 }}>+ إضافة</button>
            </div>
            <div style={{ overflowY:'auto', display:'flex', flexDirection:'column', gap:5 }}>
              {members.map(member => (
                <div key={member.id} className="member-row" style={{ padding:'9px 12px', background:'#13161f', border:'1px solid #1a1d2e', display:'flex', alignItems:'center', gap:9 }}>
                  <div style={{ width:30, height:30, borderRadius:'50%', flexShrink:0, background:'linear-gradient(135deg,#166534,#0d2b1a)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#4ade80' }}>{member.name.charAt(0)}</div>
                  {editingMember === member.id ? (
                    <div style={{ flex:1, display:'flex', gap:6 }}>
                      <input value={editNameVal} onChange={e => setEditNameVal(e.target.value)} onKeyDown={e => e.key==='Enter' && saveEditName()} style={{ flex:1, background:'#0f1117', border:'1px solid #22c55e', borderRadius:6, padding:'3px 8px', color:'#e8eaf0', fontSize:13 }} autoFocus />
                      <button onClick={saveEditName} style={{ background:'#166534', border:'none', color:'#4ade80', borderRadius:5, padding:'3px 9px', cursor:'pointer', fontSize:12 }}>✓</button>
                      <button onClick={() => setEditingMember(null)} style={{ background:'#1a1d2e', border:'none', color:'#64748b', borderRadius:5, padding:'3px 7px', cursor:'pointer', fontSize:12 }}>✕</button>
                    </div>
                  ) : <span style={{ flex:1, fontSize:13 }}>{member.name}</span>}
                  <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                    <button className="icon-btn" onClick={() => { setEditingMember(member.id); setEditNameVal(member.name) }} style={{ fontSize:12, color:'#475569', padding:'3px 5px' }}>✏️</button>
                    {confirmDelete === member.id ? (
                      <>
                        <button onClick={() => handleDeleteMember(member.id)} style={{ background:'#7f1d1d', border:'none', color:'#fca5a5', borderRadius:5, padding:'3px 8px', cursor:'pointer', fontSize:11 }}>تأكيد</button>
                        <button onClick={() => setConfirmDelete(null)} style={{ background:'#1a1d2e', border:'none', color:'#64748b', borderRadius:5, padding:'3px 7px', cursor:'pointer', fontSize:11 }}>إلغاء</button>
                      </>
                    ) : <button className="icon-btn" onClick={() => setConfirmDelete(member.id)} style={{ fontSize:12, color:'#475569', padding:'3px 5px' }}>🗑</button>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize:11, color:'#334155', textAlign:'center' }}>{members.length} عضو • حذف العضو لا يمسح سجلاته</div>
          </div>
        </div>
      )}

      {/* ── NEW WEEK MODAL ── */}
      {showWeekModal && (
        <div className="fade-in" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'#0d0f1a', borderRadius:14, padding:28, border:'1px solid #1a2744', maxWidth:380, width:'90%', textAlign:'center' }}>
            <div style={{ fontSize:34, marginBottom:12 }}>🗓</div>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:5 }}>الانتقال للأسبوع الجديد</div>
            <div style={{ fontSize:12, color:'#64748b', marginBottom:14 }}>{getWeekLabel(weekOffset+1, meetingDay, null)}</div>
            {(() => { const p = members.reduce((a,m) => a+getMemberTasks(m.id).filter(t=>!t.done).length, 0); return p>0 ? <div style={{ background:'#1c1500', border:'1px solid #78350f33', borderRadius:9, padding:'11px 14px', marginBottom:18, fontSize:13, color:'#fbbf24' }}>⚠️ سيتم ترحيل <strong>{p}</strong> تكليف غير مكتمل</div> : <div style={{ background:'#0d2b1a', border:'1px solid #22c55e22', borderRadius:9, padding:'11px 14px', marginBottom:18, fontSize:13, color:'#4ade80' }}>✅ جميع التكليفات مكتملة!</div> })()}
            <div style={{ display:'flex', gap:9, justifyContent:'center' }}>
              <button onClick={() => setShowWeekModal(false)} style={{ background:'#13161f', border:'1px solid #1e293b', color:'#64748b', borderRadius:8, padding:'8px 20px', cursor:'pointer', fontSize:13 }}>إلغاء</button>
              <button onClick={advanceWeek} style={{ background:'linear-gradient(135deg,#166534,#14532d)', border:'none', color:'#4ade80', borderRadius:8, padding:'8px 20px', cursor:'pointer', fontWeight:700, fontSize:13 }}>انتقل وارحّل التكليفات</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
