SocialNet — النسخة المحدثة

المزايا: تسجيل الConnexion، جلسات PostgreSQL، publications، رفع صور publications إلى Cloudinary، معاينة قبل النشر، صور الحساب، التعليقات مع الصور، الملفات الشخصية، البحث، نظام Amis، Messages مع صور المرسلين، تصميم الهاتف والكمبيوتر، RTL، والوضع الداكن.

متغيرات Render المطلوبة:
DATABASE_URL
SITE_PASSWORD
COOKIE_SECRET (اختياري حسب إعداد الخادم الحالي)
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET

في Render استخدم Start Command: npm start
لا تضع أسرار Cloudinary داخل GitHub.

=== مجموعات الدردشة ===
- من صفحة Messages اضغط زر (+) بجانب عنوان Messages.
- اكتب Nom du groupe.
- Choisissez au moins deux amis.
- اضغط «Créer le groupe».
- تفتح المجموعة مباشرة ويمكن للmembres Envoyer Messages.
- Groupes والmembres ورسائلها محفوظة في PostgreSQL.
