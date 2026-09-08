SocialNet — الواجهة الجديدة
=============================

هذه الحزمة تغيّر الواجهة الأمامية فقط، وتحافظ على server.js وPostgreSQL وواجهات API الحالية.

استبدل في مشروعك:
style.css
app.js
common.js
login.html
login.js
index.html
index.js
friends.html
friends.js
profile.html
profile.js
messages.html
messages.js

لا تستبدل:
server.js
schema.sql
.env

التصميم الجديد:
- واجهة RTL حديثة
- Feed مركزي
- شريط تنقل جانبي
- ملف شخصي جديد
- أصدقاء مع البحث
- رسائل بتصميم محادثة
- وضع متجاوب للهاتف والكمبيوتر
- كل JavaScript خارجي لتفادي مشاكل CSP
