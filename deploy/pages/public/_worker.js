export default {
  fetch(request, env) {
    // Preserve the public URL, auth headers, cookies and streamed response.
    return env.SEMANCONTROL.fetch(request);
  },
};
