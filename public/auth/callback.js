(function() {
  var hashParams = new URLSearchParams(window.location.hash.substring(1));
  var queryParams = new URLSearchParams(window.location.search);
  var token = hashParams.get('access_token');
  var state = hashParams.get('state');
  var error = hashParams.get('error') || queryParams.get('error');
  var detail = hashParams.get('error_description') || queryParams.get('error_description');
  var pendingState = null;

  try {
    pendingState = sessionStorage.getItem('anilife_oauth_state_v1');
    sessionStorage.removeItem('anilife_oauth_state_v1');
  } catch (e) {}

  history.replaceState(null, '', window.location.pathname);

  function fail(message) {
    document.getElementById('spinner').style.display = 'none';
    document.getElementById('title').textContent = 'Sign in did not finish';
    document.getElementById('msg').textContent = message;
    document.getElementById('back').style.display = 'inline-block';
  }

  if (error) {
    fail(error + (detail ? ': ' + detail : ''));
    return;
  }

  if (!token) {
    fail('No token was returned. Open Anilife and try signing in again.');
    return;
  }

  if (!state || !pendingState || state !== pendingState || pendingState.length < 32) {
    fail('Sign in could not be verified. Open Anilife and try signing in again.');
    return;
  }

  try {
    localStorage.setItem('anilife_oauth_token_v2', token);
    sessionStorage.removeItem('anilife_oauth_token');
  } catch (e) {
    fail('Anilife could not save the sign-in on this browser.');
    return;
  }

  document.getElementById('title').textContent = 'Signing you in';
  document.getElementById('msg').textContent = 'Loading Anilife...';
  window.location.replace('/');
})();
