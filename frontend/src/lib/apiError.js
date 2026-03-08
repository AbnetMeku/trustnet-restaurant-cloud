export function getApiErrorMessage(error, fallback = "Something went wrong.") {
  const data = error?.response?.data;

  if (typeof data === "string" && data.trim()) return data.trim();
  if (typeof data?.error === "string" && data.error.trim()) return data.error.trim();
  if (typeof data?.message === "string" && data.message.trim()) return data.message.trim();
  if (typeof data?.msg === "string" && data.msg.trim()) return data.msg.trim();

  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    const first = data.errors[0];
    if (typeof first === "string" && first.trim()) return first.trim();
    if (typeof first?.message === "string" && first.message.trim()) return first.message.trim();
  }

  if (typeof error?.message === "string" && error.message.trim()) return error.message.trim();

  return fallback;
}
