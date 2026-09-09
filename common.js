// تحديد رابط السيرفر المباشر (استبدل بالرابط المباشر الخاص بك على الإنترنت)
const API_BASE_URL = "https://secretnet1-com.onrender.com"; 

// دالة موحدة لإرسال الطلبات مع الهوية
async function customFetch(endpoint, options = {}) {
  const userId = localStorage.getItem("userId") || localStorage.getItem("currentUserId") || "1";
  
  const headers = {
    "Content-Type": "application/json",
    "x-user-id": userId,
    ...(options.headers || {})
  };

  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, { ...options, headers });
    return await response.json();
  } catch (error) {
    console.error("Fetch error:", error);
    return null;
  }
}
