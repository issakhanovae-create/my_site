const TOKEN_KEY = "shop-token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.removeItem("shop-password");
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("shop-password");
}

export function authHeaders(extra) {
  return Object.assign({ Authorization: "Bearer " + getToken() }, extra || {});
}

export async function api(path, options = {}) {
  try {
    const response = await fetch(path, options);
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } catch {
    return {
      response: { ok: false, status: 0, statusText: "offline" },
      data: { error: "Нет связи с сайтом" }
    };
  }
}
