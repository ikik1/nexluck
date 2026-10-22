import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { t } from './i18n';
import { api } from './api';

function Endpoint({ path, operation }) {
  const [values, setValues] = useState({});
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async event => {
    event.preventDefault();
    setBusy(true);
    try {
      const query = new URLSearchParams();
      for (const parameter of operation.parameters || []) {
        const value = values[parameter.name] ?? parameter.schema.default ?? '';
        if (value === '') continue;
        const entries = parameter.schema.type === 'array' ? String(value).split('\n').filter(Boolean) : [value];
        entries.forEach(entry => query.append(parameter.name, entry));
      }
      setResult(JSON.stringify(await api(`/cms/api${path}?${query}`), null, 2));
    } catch (error) { setResult(error.message); }
    finally { setBusy(false); }
  };
  return React.createElement('details', { className: 'api-endpoint', open: true },
    React.createElement('summary', null, `GET ${path}`),
    React.createElement('h2', null, t(operation.summary)),
    React.createElement('form', { onSubmit: run },
      (operation.parameters || []).map(parameter => React.createElement('label', { key: parameter.name },
        React.createElement('code', null, parameter.name), parameter.required ? ` · ${t('Required')}` : ` · ${t('Optional')}`,
        React.createElement(parameter.schema.type === 'array' ? 'textarea' : 'input', {
          value: values[parameter.name] ?? parameter.schema.default ?? '',
          required: parameter.required,
          placeholder: parameter.schema.type === 'array' ? t('One ID per line') : '',
          onChange: event => setValues(current => ({ ...current, [parameter.name]: event.target.value }))
        }))),
      React.createElement('button', { className: 'primary', disabled: busy }, t(busy ? 'Loading...' : 'Try request'))),
    result && React.createElement('pre', { role: 'status' }, result),
    React.createElement('h3', null, t('Responses')),
    React.createElement('ul', null, Object.entries(operation.responses).map(([status, response]) =>
      React.createElement('li', { key: status }, React.createElement('code', null, status), ` · ${t(response.description)}`))));
}

function Documentation() {
  const [spec, setSpec] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/cms/api/openapi.json').then(setSpec).catch(error => setError(error.message)); }, []);
  if (error) return React.createElement('p', { role: 'alert' }, error);
  if (!spec) return React.createElement('p', { role: 'status' }, t('Loading API documentation...'));
  return React.createElement(React.Fragment, null,
    React.createElement('a', { href: '/cms/api/openapi.json' }, t('OpenAPI JSON')),
    Object.entries(spec.paths).map(([path, methods]) =>
      React.createElement(Endpoint, { key: path, path, operation: methods.get })));
}

if (new URLSearchParams(location.search).get('view') === 'swagger') {
  Promise.all([
    import('swagger-ui-dist/swagger-ui-es-bundle.js'),
    import('swagger-ui-dist/swagger-ui.css')
  ]).then(([{ default: SwaggerUI }]) => {
    SwaggerUI({
      dom_id: '#swagger-ui', url: '/cms/api/openapi.json', deepLinking: true, validatorUrl: null,
      defaultModelExpandDepth: 4,
      requestInterceptor: request => { request.credentials = 'same-origin'; return request; }
    });
  }).catch(error => {
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = error.message;
    document.getElementById('swagger-ui').replaceChildren(message);
  });
} else {
  createRoot(document.getElementById('swagger-ui')).render(React.createElement(Documentation));
}
