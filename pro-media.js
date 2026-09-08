"use strict";

window.SocialMedia = {
  async fileToDataURL(file, maxWidth = 1600, quality = 0.82) {
    if (!file || !file.type.startsWith("image/")) throw new Error("اختر صورة صحيحة.");
    if (file.size > 8 * 1024 * 1024) throw new Error("حجم الصورة كبير جدًا. الحد الأقصى 8MB.");
    const img = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = fr.result; };
      fr.onerror = reject; fr.readAsDataURL(file);
    });
    const scale = Math.min(1, maxWidth / img.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  }
};
