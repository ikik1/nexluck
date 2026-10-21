import SwaggerUI from 'swagger-ui-dist/swagger-ui-es-bundle.js';
import 'swagger-ui-dist/swagger-ui.css';

SwaggerUI({ dom_id: '#swagger-ui', url: '/cms/api/openapi.json', deepLinking: true, validatorUrl: null,
  requestInterceptor: request => { request.credentials = 'same-origin'; return request; } });
