"use strict";

const form = document.getElementById("loginForm");
const nameInput = document.getElementById("userName");
const passwordInput = document.getElementById("sitePassword");
const button = document.getElementById("loginButton");
const error = document.getElementById("loginError");


/*
 * التحقق من وجود جلسة في نفس التبويب
 */
async function checkExistingTabSession() {

    const token = sessionStorage.getItem("sn_token");

    if (!token) {
        return;
    }

    try {

        const response = await fetch("/api/me", {
            method: "GET",
            headers: {
                "Authorization": "Bearer " + token
            }
        });

        if (response.ok) {

            window.location.replace("/index.html");
            return;
        }

        sessionStorage.removeItem("sn_token");
        sessionStorage.removeItem("sn_user");

    } catch (err) {

        console.error("Session check error:", err);

    }
}


/*
 * تسجيل الدخول
 */
form.addEventListener("submit", async function (event) {

    event.preventDefault();

    error.textContent = "";

    const name = nameInput.value.trim();
    const password = passwordInput.value;

    if (!name) {

        error.textContent = "أدخل اسمك.";
        nameInput.focus();
        return;
    }

    if (!password) {

        error.textContent = "أدخل كلمة المرور.";
        passwordInput.focus();
        return;
    }


    button.disabled = true;
    button.textContent = "جاري الدخول...";


    try {

        const response = await fetch("/api/enter", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                name: name,
                password: password
            })

        });


        const data = await response.json().catch(function () {
            return {};
        });


        if (!response.ok) {

            throw new Error(
                data.error || "فشل تسجيل الدخول."
            );
        }


        /*
         * الخادم يجب أن يعيد Token
         */
        if (!data.token) {

            throw new Error(
                "الخادم لم يُرجع رمز الجلسة."
            );
        }


        /*
         * حفظ الجلسة في هذا التبويب فقط
         */
        sessionStorage.setItem(
            "sn_token",
            data.token
        );


        if (data.user) {

            sessionStorage.setItem(
                "sn_user",
                JSON.stringify(data.user)
            );

        }


        /*
         * الانتقال إلى الصفحة الرئيسية
         */
        window.location.replace("/index.html");


    } catch (err) {

        console.error("Login error:", err);

        error.textContent =
            err.message || "حدث خطأ أثناء تسجيل الدخول.";

    } finally {

        button.disabled = false;
        button.textContent = "دخول";

    }

});


/*
 * تشغيل فحص الجلسة عند فتح login.html
 */
checkExistingTabSession();
