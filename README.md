# 📋 متابعة التكليفات — دليل النشر

## الخطوات (30 دقيقة وتخلص)

---

## 1️⃣ Supabase — قاعدة البيانات

1. روح **https://supabase.com** وسجّل حساب مجاني
2. اضغط **New Project** → اكتب اسم المشروع → اختار كلمة سر قوية → **Create**
3. استنى 2 دقيقة لحد ما يتجهّز المشروع
4. من القائمة الجانبية اضغط **SQL Editor** → **New Query**
5. افتح ملف `supabase_schema.sql` وانسخ محتواه كله → الصقه في المحرر → اضغط **Run**
6. المفروض تشوف رسالة "Success" في الأسفل

### استخراج مفاتيح API
- روح **Project Settings** (أيقونة الترس) → **API**
- انسخ:
  - **Project URL** → هيبقى `VITE_SUPABASE_URL`
  - **anon public** key → هيبقى `VITE_SUPABASE_ANON_KEY`

---

## 2️⃣ GitHub — رفع الكود

1. روح **https://github.com** وسجّل حساب لو مش عندك
2. اضغط **New repository** → سمّيه `meeting-tracker` → **Create**
3. افتح Terminal/Command Prompt في فولدر المشروع وشغّل:

```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/USERNAME/meeting-tracker.git
git push -u origin main
```
> غيّر `USERNAME` باسم حسابك على GitHub

---

## 3️⃣ Vercel — النشر

1. روح **https://vercel.com** وسجّل حساب (ممكن تسجّل بـ GitHub مباشرة)
2. اضغط **Add New → Project**
3. اختار الـ repo بتاع `meeting-tracker` → اضغط **Import**
4. قبل ما تضغط Deploy، افتح قسم **Environment Variables** وأضف:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | الـ URL اللي نسخته من Supabase |
| `VITE_SUPABASE_ANON_KEY` | الـ anon key اللي نسخته |

5. اضغط **Deploy** — هيديك لينك زي:
   `https://meeting-tracker-xyz.vercel.app`

**خلاص! 🎉 افتح اللينك ده من أي جهاز وهتلاقي التطبيق.**

---

## 🔄 لو عايز تعمل تحديث بعدين

```bash
git add .
git commit -m "update"
git push
```
Vercel هيعمل deploy تلقائي في ثواني.

---

## 📁 هيكل الملفات

```
meeting-tracker/
├── src/
│   ├── main.jsx          ← نقطة البداية
│   ├── App.jsx           ← التطبيق كله
│   ├── db.js             ← كل calls قاعدة البيانات
│   └── supabase.js       ← إعداد Supabase client
├── index.html
├── vite.config.js
├── package.json
├── supabase_schema.sql   ← شغّله في Supabase مرة واحدة
├── .env.example          ← نموذج للمتغيرات
└── .gitignore
```

---

## ⚠️ ملاحظات مهمة

- ملف `.env` **لا ترفعوه على GitHub** — موجود في `.gitignore` تلقائياً
- المتغيرات هتتحط في Vercel مباشرة (مش في الكود)
- التطبيق مجاني 100% — Supabase وVercel عندهم free tier كافي
- البيانات محفوظة على السيرفر ومتزامنة بين كل الأجهزة
