const swaggerUi = require('swagger-ui-express');

const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Playrup Backend API',
    version: '1.0.0',
    description: 'Swagger documentation for Playrup backend API',
  },
  servers: [
    {
      url: 'http://localhost:5000',
      description: 'Local development server',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          error: { type: 'string' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          userId: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          role: { type: 'string' },
        },
      },
      GenericRequest: {
        type: 'object',
        additionalProperties: true,
      },
    },
  },
  paths: {
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' },
                  phone: { type: 'string' },
                },
                required: ['email', 'password', 'phone'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'OTP sent' },
          '400': {
            description: 'Invalid request',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/auth/verify-otp': {
      post: {
        tags: ['Auth'],
        summary: 'Verify OTP and activate user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  otp: { type: 'string' },
                },
                required: ['email', 'otp'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'User verified successfully' },
          '400': {
            description: 'Invalid or expired OTP',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login user after verification',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  phone: { type: 'string' },
                  password: { type: 'string' },
                },
                required: ['password'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'User logged in successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' },
              },
            },
          },
          '400': {
            description: 'Invalid credentials',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/academy/onboard-academy': {
      post: {
        tags: ['Academy'],
        summary: 'Onboard a new academy',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'Academy onboarded' } },
      },
    },
    '/api/academy/configure': {
      post: {
        tags: ['Academy'],
        summary: 'Configure academy settings',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'Configuration updated' } },
      },
    },
    '/api/academy/getDetails': {
      post: {
        tags: ['Academy'],
        summary: 'Get academy details',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'Academy details retrieved' } },
      },
    },
    '/api/academy/locations': {
      get: {
        tags: ['Academy'],
        summary: 'List available locations',
        responses: { '200': { description: 'Location list returned' } },
      },
    },
    '/api/academy/sports/{city}': {
      get: {
        tags: ['Academy'],
        summary: 'Get sports by city',
        parameters: [
          {
            name: 'city',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: { '200': { description: 'Sports for city returned' } },
      },
    },
    '/api/academy/getAcademies': {
      get: {
        tags: ['Academy'],
        summary: 'Get list of academies',
        responses: { '200': { description: 'Academies returned' } },
      },
    },
    '/api/academy/getCourts': {
      get: {
        tags: ['Academy'],
        summary: 'Get courts list',
        responses: { '200': { description: 'Courts returned' } },
      },
    },
    '/api/academy/user-academies': {
      post: {
        tags: ['Academy'],
        summary: 'Get academies for a user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'User academies returned' } },
      },
    },
    '/api/activity/createActivity': {
      post: {
        tags: ['Activity'],
        summary: 'Create a new activity',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'Activity created' } },
      },
    },
    '/api/activity/allActivities': {
      get: {
        tags: ['Activity'],
        summary: 'Get all activities',
        responses: { '200': { description: 'Activities returned' } },
      },
    },
    '/api/activity/cancelActivity': {
      post: {
        tags: ['Activity'],
        summary: 'Cancel an activity',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'Activity cancelled' } },
      },
    },
    '/api/activity/requestJoin': {
      post: {
        tags: ['Activity'],
        summary: 'Request to join an activity',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'Join request sent' } },
      },
    },
    '/api/activity/userActivities': {
      post: {
        tags: ['Activity'],
        summary: 'Get activities for a user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'User activities returned' } },
      },
    },
    '/api/activity/chat/{activityId}/participants': {
      get: {
        tags: ['Activity Chat'],
        summary: 'Get activity chat participants',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'activityId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Chat participants returned' },
          '403': { description: 'Only activity participants can access chat' },
          '404': { description: 'Activity not found' },
        },
      },
    },
    '/api/activity/chat/{activityId}/messages': {
      get: {
        tags: ['Activity Chat'],
        summary: 'Get activity chat messages',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'activityId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
          },
          {
            name: 'before',
            in: 'query',
            required: false,
            description: 'ISO date cursor to fetch older messages',
            schema: { type: 'string', format: 'date-time' },
          },
        ],
        responses: {
          '200': { description: 'Chat messages returned' },
          '400': { description: 'Invalid query parameters' },
          '403': { description: 'Only activity participants can access chat' },
          '404': { description: 'Activity not found' },
        },
      },
      post: {
        tags: ['Activity Chat'],
        summary: 'Send a chat message to activity participants',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'activityId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: { type: 'string', maxLength: 1000 },
                  attachment: {
                    type: 'object',
                    properties: {
                      url: { type: 'string' },
                      fileName: { type: 'string' },
                      mimeType: { type: 'string' },
                      size: { type: 'number' },
                    },
                  },
                },
                description: 'At least one of message or attachment should be provided.',
              },
            },
          },
        },
        responses: {
          '201': { description: 'Chat message sent' },
          '400': { description: 'Invalid message payload' },
          '403': { description: 'Only activity participants can send chat messages' },
          '404': { description: 'Activity not found' },
        },
      },
    },
    '/api/activity/chat/{activityId}/read': {
      post: {
        tags: ['Activity Chat'],
        summary: 'Mark activity chat messages as read',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'activityId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  messageIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional list of message IDs. If omitted, marks all unread messages in this activity as read.',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Read status updated' },
          '403': { description: 'Only activity participants can update read status' },
          '404': { description: 'Activity not found' },
        },
      },
    },
    '/api/activity/chat/{activityId}/upload-photo': {
      post: {
        tags: ['Activity Chat'],
        summary: 'Upload an image for activity chat message',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'activityId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  image: {
                    type: 'string',
                    format: 'binary',
                  },
                },
                required: ['image'],
              },
            },
          },
        },
        responses: {
          '201': { description: 'Image uploaded successfully' },
          '400': { description: 'Invalid upload payload' },
          '403': { description: 'Only activity participants can upload chat images' },
          '404': { description: 'Activity not found' },
        },
      },
    },
    '/api/activity/chat/{activityId}/typing': {
      get: {
        tags: ['Activity Chat'],
        summary: 'Get users currently typing in activity chat',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'activityId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Typing users returned' },
          '403': { description: 'Only activity participants can access typing status' },
          '404': { description: 'Activity not found' },
        },
      },
      post: {
        tags: ['Activity Chat'],
        summary: 'Set current user typing status in activity chat',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'activityId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  isTyping: { type: 'boolean' },
                },
                required: ['isTyping'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Typing status updated' },
          '403': { description: 'Only activity participants can update typing status' },
          '404': { description: 'Activity not found' },
        },
      },
    },
    '/api/activity/chat/{activityId}/unread-count': {
      get: {
        tags: ['Activity Chat'],
        summary: 'Get unread chat message count for current user',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'activityId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Unread count returned' },
          '403': { description: 'Only activity participants can access unread count' },
          '404': { description: 'Activity not found' },
        },
      },
    },
    '/api/request/hosted/pending-requests': {
      post: {
        tags: ['Request'],
        summary: 'Get hosted pending requests',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'Pending requests returned' } },
      },
    },
    '/api/request/my-requests': {
      post: {
        tags: ['Request'],
        summary: 'Get my requests',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'My requests returned' } },
      },
    },
    '/api/request/approve-request': {
      post: {
        tags: ['Request'],
        summary: 'Approve a request',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'Request approved' } },
      },
    },
    '/api/request/reject-request': {
      post: {
        tags: ['Request'],
        summary: 'Reject a request',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'Request rejected' } },
      },
    },
    '/api/request/withdraw-request': {
      post: {
        tags: ['Request'],
        summary: 'Withdraw a request',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'Request withdrawn' } },
      },
    },
    '/api/booking/create': {
      post: {
        tags: ['Booking'],
        summary: 'Create a booking',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'Booking created' } },
      },
    },
    '/api/booking/search': {
      post: {
        tags: ['Booking'],
        summary: 'Search bookings',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'Search results returned' } },
      },
    },
    '/api/booking/check-availability': {
      post: {
        tags: ['Booking'],
        summary: 'Check availability',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'Availability returned' } },
      },
    },
    '/api/booking/my-bookings': {
      post: {
        tags: ['Booking'],
        summary: 'Get my bookings',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'My bookings returned' } },
      },
    },
    '/api/booking/cancel-booking': {
      post: {
        tags: ['Booking'],
        summary: 'Cancel a booking',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'Booking cancelled' } },
      },
    },
    '/api/booking/modify-booking': {
      patch: {
        tags: ['Booking'],
        summary: 'Modify a booking',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'Booking modified' } },
      },
    },
    '/api/booking/academy-bookings': {
      post: {
        tags: ['Booking'],
        summary: 'Get academy bookings',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'Academy bookings returned' } },
      },
    },
    '/api/dashboard/dashboard-data': {
      post: {
        tags: ['Dashboard'],
        summary: 'Get dashboard data',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'Dashboard data returned' } },
      },
    },
    '/api/user/all-sports': {
      post: {
        tags: ['User'],
        summary: 'Get all sports',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenericRequest' },
            },
          },
        },
        responses: { '200': { description: 'Sports returned' } },
      },
    },
  },
};

function setupSwagger(app) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

module.exports = setupSwagger;

function setupSwagger(app) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

module.exports = setupSwagger;