const SocialNet = {

    token() {
        return sessionStorage.getItem("sn_token");
    },

    user() {
        try {
            return JSON.parse(
                sessionStorage.getItem("sn_user")
            );
        } catch {
            return null;
        }
    },

    headers(extra = {}) {

        const token = this.token();

        return {
            ...extra,

            ...(token
                ? {
                    Authorization:
                        "Bearer " + token
                }
                : {})
        };
    },

    async api(url, options = {}) {

        const optionsCopy = {
            ...options
        };

        optionsCopy.headers =
            this.headers(
                options.headers || {}
            );

        const response =
            await fetch(
                url,
                optionsCopy
            );

        const data =
            await response
                .json()
                .catch(() => ({}));

        if (response.status === 401) {

            sessionStorage.removeItem(
                "sn_token"
            );

            sessionStorage.removeItem(
                "sn_user"
            );

            if (
                !location.pathname.endsWith(
                    "/login.html"
                )
            ) {
                location.replace(
                    "/login.html"
                );
            }

            throw new Error(
                data.error ||
                "يجب تسجيل الدخول."
            );
        }

        if (!response.ok) {

            throw new Error(
                data.error ||
                "حدث خطأ."
            );
        }

        return data;
    },

    async me() {
        return this.api(
            "/api/me"
        );
    },

    requireLogin() {

        if (!this.token()) {

            location.replace(
                "/login.html"
            );

            return false;
        }

        return true;
    },

    async logout() {

        try {

            if (this.token()) {

                await this.api(
                    "/api/logout",
                    {
                        method: "POST"
                    }
                );
            }

        } catch (err) {

            console.error(err);

        } finally {

            sessionStorage.removeItem(
                "sn_token"
            );

            sessionStorage.removeItem(
                "sn_user"
            );

            location.replace(
                "/login.html"
            );
        }
    },

    escape(text) {

        return String(text ?? "")
            .replace(
                /[&<>"']/g,
                char => ({
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#039;"
                }[char])
            );
    },

    escapeAttribute(text) {

        return this.escape(text)
            .replace(/`/g, "&#096;");
    },

    formatDate(date) {

        return new Date(date)
            .toLocaleString(
                "ar-TN",
                {
                    dateStyle: "medium",
                    timeStyle: "short"
                }
            );
    }
};

window.SocialNet = SocialNet;
