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
      FeedbackStatus: {
        type: 'object',
        properties: {
          canSubmit: { type: 'boolean' },
          totalRecipients: { type: 'integer' },
          submittedCount: { type: 'integer' },
          isComplete: { type: 'boolean' },
        },
      },
      FeedbackEntryInput: {
        type: 'object',
        properties: {
          recipientId: {
            type: 'object',
            description: 'Encrypted recipient user id',
            additionalProperties: true,
          },
          noShow: { type: 'boolean' },
          punctualStatus: { type: 'string', enum: ['Punctual', 'Late', null] },
          teamPlayerScore: { type: 'integer', enum: [-2, -1, 1, 2, null] },
          paymentScore: { type: 'integer', enum: [-2, -1, 1, 2, null] },
          skillLevel: {
            type: 'string',
            enum: ['Beginner', 'Amateur', 'Intermediate', 'Advanced', 'Professional', null]
          },
        },
        required: ['recipientId', 'noShow'],
      },
      UserFeedbackProfile: {
        type: 'object',
        properties: {
          noShowCount: { type: 'integer' },
          totalFeedbackReceived: { type: 'integer' },
          punctual: {
            type: 'object',
            properties: {
              punctualCount: { type: 'integer' },
              lateCount: { type: 'integer' },
              ratedCount: { type: 'integer' },
              punctualityPercentage: { type: 'number' },
            },
          },
          teamPlayer: {
            type: 'object',
            properties: {
              totalScore: { type: 'number' },
              ratingCount: { type: 'integer' },
              averageScore: { type: 'number' },
            },
          },
          paymentReliability: {
            type: 'object',
            properties: {
              totalScore: { type: 'number' },
              ratingCount: { type: 'integer' },
              averageScore: { type: 'number' },
            },
          },
          skillLevel: {
            type: 'object',
            properties: {
              ratingCount: { type: 'integer' },
              averageScore: { type: 'number' },
              averageLabel: { type: 'string' },
              counts: { type: 'object', additionalProperties: { type: 'integer' } },
            },
          },
          lastFeedbackAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      UserPlayPal: {
        type: 'object',
        properties: {
          id: { type: 'object', additionalProperties: true },
          name: { type: 'string' },
          email: { type: 'string' },
        },
      },
      SportActivityRating: {
        type: 'object',
        properties: {
          activityId: { type: 'object', additionalProperties: true },
          playedAt: { type: 'string', format: 'date-time', nullable: true },
          ratingScore: { type: 'number' },
          ratingLabel: { type: 'string' },
        },
      },
      UserSportRatingSummary: {
        type: 'object',
        properties: {
          sportName: { type: 'string' },
          selfRating: {
            type: 'object',
            properties: {
              score: { type: 'number' },
              label: { type: 'string' },
            },
          },
          receivedRatingComparison: {
            type: 'object',
            properties: {
              averageScore: { type: 'number' },
              averageLabel: { type: 'string' },
              basedOnRatings: { type: 'integer' },
              last5ActivitiesAverageScore: { type: 'number' },
              last5ActivitiesAverageLabel: { type: 'string' },
            },
          },
          recentActivityRatings: {
            type: 'array',
            items: { $ref: '#/components/schemas/SportActivityRating' },
          },
        },
      },
      GenericRequest: {
        type: 'object',
        additionalProperties: true,
      },
      PublicParticipant: {
        type: 'object',
        properties: {
          id: { type: 'object', additionalProperties: true },
          name: { type: 'string' },
          avatarUrl: { type: 'string', nullable: true },
          isHost: { type: 'boolean' },
        },
      },
      PublicActivityResponse: {
        type: 'object',
        properties: {
          activity: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              shareCode: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              sport: { type: 'string' },
              city: { type: 'string' },
              location: { type: 'string' },
              address: { type: 'string' },
              date: { type: 'string' },
              fromTime: { type: 'string' },
              toTime: { type: 'string' },
              status: { type: 'string' },
              maxPlayers: { type: 'integer' },
              slotsRemaining: { type: 'integer' },
              participants: {
                type: 'array',
                items: { $ref: '#/components/schemas/PublicParticipant' },
              },
              host: {
                type: 'object',
                properties: {
                  id: { type: 'object', additionalProperties: true, nullable: true },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
      },
      PublicUserProfileResponse: {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              id: { type: 'object', additionalProperties: true },
              name: { type: 'string' },
              avatarUrl: { type: 'string', nullable: true },
              joinedOn: { type: 'string', format: 'date-time' },
              pastActivities: { type: 'integer' },
              skillLevel: { type: 'string' },
            },
          },
        },
      },
      AcademyVenuePublicResponse: {
        type: 'object',
        properties: {
          venue: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              address: { type: 'string' },
              city: { type: 'string' },
              mapLink: { type: 'string' },
              photos: {
                type: 'array',
                items: { type: 'string' },
              },
              openTime: { type: 'string' },
              closeTime: { type: 'string' },
              amenities: {
                type: 'object',
                properties: {
                  parking: { type: 'boolean' },
                  drinkingWater: { type: 'boolean' },
                  changingRooms: { type: 'boolean' },
                  warmupArea: { type: 'boolean' },
                  wifi: { type: 'boolean' },
                  cctvCamera: { type: 'boolean' },
                  shower: { type: 'boolean' },
                  cafeteria: { type: 'boolean' },
                },
              },
              totalGamesPlayed: { type: 'integer' },
              upcomingGames: { type: 'integer' },
              averageRating: { type: 'number' },
              totalRatings: { type: 'integer' },
              shareCode: { type: 'string' },
            },
          },
        },
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
    '/api/academy/profile/{academyId}': {
      get: {
        tags: ['Academy'],
        summary: 'Get academy profile with venue stats for owner',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'academyId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Academy profile returned' },
          '403': { description: 'Not authorised' },
          '404': { description: 'Academy not found' },
        },
      },
      put: {
        tags: ['Academy'],
        summary: 'Update academy profile details',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'academyId',
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
                  name: { type: 'string' },
                  phone: { type: 'string' },
                  address: { type: 'string' },
                  city: { type: 'string' },
                  mapLink: { type: 'string' },
                  openTime: { type: 'string' },
                  closeTime: { type: 'string' },
                  amenities: {
                    type: 'object',
                    properties: {
                      parking: { type: 'boolean' },
                      drinkingWater: { type: 'boolean' },
                      changingRooms: { type: 'boolean' },
                      warmupArea: { type: 'boolean' },
                      wifi: { type: 'boolean' },
                      cctvCamera: { type: 'boolean' },
                      shower: { type: 'boolean' },
                      cafeteria: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Academy profile updated' },
          '403': { description: 'Not authorised' },
          '404': { description: 'Academy not found' },
        },
      },
    },
    '/api/academy/profile/{academyId}/photos': {
      post: {
        tags: ['Academy'],
        summary: 'Upload academy venue photos',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'academyId',
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
                  photos: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' },
                  },
                },
                required: ['photos'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Photos uploaded successfully' },
          '403': { description: 'Not authorised' },
          '404': { description: 'Academy not found' },
        },
      },
      delete: {
        tags: ['Academy'],
        summary: 'Delete one academy venue photo',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'academyId',
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
                  photoUrl: { type: 'string' },
                },
                required: ['photoUrl'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Photo removed' },
          '403': { description: 'Not authorised' },
          '404': { description: 'Academy not found' },
        },
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
    '/api/activity/completeActivity': {
      post: {
        tags: ['Activity'],
        summary: 'Mark an activity as completed and trigger karma distribution',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  activityId: { type: 'string' },
                  hostEmail: { type: 'string', description: 'Encrypted host email' },
                  hostId: { type: 'string', description: 'Encrypted host userId' },
                },
                required: ['activityId', 'hostEmail', 'hostId'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Activity completed and karma distribution triggered' },
          '400': { description: 'Invalid request or activity cannot be completed yet' },
          '404': { description: 'Activity not found or caller is not the host' },
        },
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
    '/api/activity/{activityId}/participants': {
      get: {
        tags: ['Activity'],
        summary: 'Get participants for an activity (host + joined players)',
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
          '200': { description: 'Activity participants returned' },
          '404': { description: 'Activity not found' },
        },
      },
    },
    '/api/public/activity/{shareCode}': {
      get: {
        tags: ['Public Activity'],
        summary: 'Get public activity details by share code (no auth required)',
        parameters: [
          {
            name: 'shareCode',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Public activity details returned',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PublicActivityResponse' },
              },
            },
          },
          '404': { description: 'Activity not found' },
        },
      },
    },
    '/api/public/user/profile-summary': {
      post: {
        tags: ['Public Activity'],
        summary: 'Get public-safe participant profile details (no auth required)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  userId: {
                    type: 'object',
                    description: 'Encrypted user id from public participants payload',
                    additionalProperties: true,
                  },
                },
                required: ['userId'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Public profile returned',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PublicUserProfileResponse' },
              },
            },
          },
          '404': { description: 'User not found' },
        },
      },
    },
    '/api/public/venue/{shareCode}': {
      get: {
        tags: ['Public Activity'],
        summary: 'Get public venue profile details by share code',
        parameters: [
          {
            name: 'shareCode',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Venue details returned',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AcademyVenuePublicResponse' },
              },
            },
          },
          '404': { description: 'Venue not found' },
        },
      },
    },
    '/api/activity/{activityId}/feedback-form': {
      get: {
        tags: ['Activity Feedback'],
        summary: 'Get feedback form data for a completed activity',
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
          '200': { description: 'Feedback form data returned' },
          '400': { description: 'Activity is not completed yet' },
          '403': { description: 'Only activity participants can submit feedback' },
          '404': { description: 'Activity not found' },
        },
      },
    },
    '/api/activity/{activityId}/feedback': {
      post: {
        tags: ['Activity Feedback'],
        summary: 'Submit anonymous feedback for other participants in a completed activity',
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
                  feedback: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/FeedbackEntryInput' },
                  },
                },
                required: ['feedback'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Feedback submitted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    feedbackStatus: { $ref: '#/components/schemas/FeedbackStatus' },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid feedback payload' },
          '403': { description: 'Only activity participants can submit feedback' },
          '404': { description: 'Activity not found' },
        },
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
        summary: 'Approve a request and notify participant',
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
    '/api/booking/academy-cancel-booking': {
      post: {
        tags: ['Booking'],
        summary: 'Cancel a booking by academy and notify user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  bookingId: { type: 'string' },
                  academyId: { type: 'string' },
                },
                required: ['bookingId', 'academyId'],
              },
            },
          },
        },
        responses: { '200': { description: 'Booking cancelled and user notified' } },
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
        responses: {
          '200': {
            description: 'Dashboard data returned',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    upcomingBookingsCount: { type: 'number' },
                    upcomingBookings: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    pastActivitiesCount: { type: 'number' },
                    recentPastActivities: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    pastHostedActivitiesCount: { type: 'number' },
                    totalKarmaPoints: { type: 'number', description: 'Total karma points earned by the user' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/notification/my': {
      get: {
        tags: ['Notification'],
        summary: 'Get current user notifications',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
          },
          {
            name: 'offset',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 0, default: 0 },
          },
        ],
        responses: {
          '200': { description: 'Notifications returned' },
        },
      },
    },
    '/api/notification/unread-count': {
      get: {
        tags: ['Notification'],
        summary: 'Get unread notification count for current user',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Unread count returned' },
        },
      },
    },
    '/api/notification/{notificationId}/read': {
      patch: {
        tags: ['Notification'],
        summary: 'Mark a single notification as read',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'notificationId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Notification marked read' },
        },
      },
    },
    '/api/notification/read-all': {
      patch: {
        tags: ['Notification'],
        summary: 'Mark all current user notifications as read',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'All notifications marked read' },
        },
      },
    },
    '/api/notification/admin/templates': {
      get: {
        tags: ['Notification Admin'],
        summary: 'List notification templates and channel settings',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Template list returned' },
        },
      },
    },
    '/api/notification/admin/templates/{templateKey}': {
      put: {
        tags: ['Notification Admin'],
        summary: 'Update notification template text and channel toggles',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'templateKey',
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
                  title: { type: 'string' },
                  body: { type: 'string' },
                  channels: {
                    type: 'object',
                    properties: {
                      push: { type: 'boolean' },
                      email: { type: 'boolean' },
                      sms: { type: 'boolean' },
                    },
                  },
                },
                required: ['title', 'body', 'channels'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Template updated' },
        },
      },
    },
    '/api/notification/admin/all': {
      get: {
        tags: ['Notification Admin'],
        summary: 'List all notifications for super admin',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          },
          {
            name: 'offset',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 0, default: 0 },
          },
        ],
        responses: {
          '200': { description: 'Notifications returned' },
        },
      },
    },
    '/api/user/all-sports': {
      post: {
        tags: ['User'],
        summary: 'Get all sports (legacy endpoint)',
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
    '/api/user/sports': {
      get: {
        tags: ['User'],
        summary: 'Get available sports list',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Sports returned' },
        },
      },
    },
    '/api/user/playpals': {
      get: {
        tags: ['User'],
        summary: 'Get current user play pals',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'Play pals returned',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    playPals: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/UserPlayPal' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/user/games': {
      post: {
        tags: ['User'],
        summary: 'Add sport to current user games list',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  gameName: { type: 'string' },
                },
                required: ['gameName'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Sport added or already exists' },
          '400': { description: 'Invalid sport value' },
        },
      },
      delete: {
        tags: ['User'],
        summary: 'Remove sport from current user games list',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  gameName: { type: 'string' },
                },
                required: ['gameName'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Sport removed' },
          '404': { description: 'Sport not found in user list' },
        },
      },
    },
    '/api/user/games/self-rating': {
      patch: {
        tags: ['User'],
        summary: 'Update self rating for a sport in user games list',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  gameName: { type: 'string' },
                  selfRating: {
                    type: 'string',
                    enum: ['Beginner', 'Amateur', 'Intermediate', 'Advanced', 'Professional'],
                  },
                },
                required: ['gameName', 'selfRating'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Self rating updated' },
          '404': { description: 'Sport not found in user list' },
        },
      },
    },
    '/api/user/profile-summary': {
      get: {
        tags: ['User'],
        summary: 'Get current user profile summary including play pals and sport ratings',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'Profile summary returned',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'object', additionalProperties: true },
                        name: { type: 'string' },
                        email: { type: 'string' },
                        phone: { type: 'string' },
                        role: { type: 'string' },
                        joinedOn: { type: 'string', format: 'date-time' },
                        karmaPoints: { type: 'number' },
                        feedbackProfile: { $ref: '#/components/schemas/UserFeedbackProfile' },
                        playPals: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/UserPlayPal' },
                        },
                        availableSports: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                        sportRatings: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/UserSportRatingSummary' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '404': { description: 'User not found' },
        },
      },
    },
    '/api/user/profile-summary/view': {
      post: {
        tags: ['User'],
        summary: 'Get profile summary for a specific user by encrypted userId',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  userId: { type: 'object', additionalProperties: true },
                },
                required: ['userId'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Profile summary returned' },
          '400': { description: 'userId is required' },
          '404': { description: 'User not found' },
        },
      },
    },
    '/api/user/venue/{shareCode}': {
      get: {
        tags: ['User'],
        summary: 'Get venue details with viewer preference and rating',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'shareCode',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Venue details returned' },
          '404': { description: 'Venue not found' },
        },
      },
    },
    '/api/user/venue/{academyId}/favorite': {
      post: {
        tags: ['User'],
        summary: 'Mark or unmark venue as favorite',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'academyId',
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
                  isFavorite: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Favorite status updated' },
          '404': { description: 'Venue not found' },
        },
      },
    },
    '/api/user/venue/{academyId}/rate': {
      post: {
        tags: ['User'],
        summary: 'Submit or update venue star rating',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'academyId',
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
                  rating: { type: 'number', minimum: 1, maximum: 5 },
                },
                required: ['rating'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Rating saved' },
          '400': { description: 'Invalid rating value' },
          '404': { description: 'Venue not found' },
        },
      },
    },
    '/api/user/favorite-academies': {
      get: {
        tags: ['User'],
        summary: 'Get current user favorite academy IDs',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Favorite academy IDs returned' },
          '404': { description: 'User not found' },
        },
      },
    },

    // ─── Drop-In ────────────────────────────────────────────────────────────
    '/api/dropin/create': {
      post: {
        tags: ['Drop-In'],
        summary: 'Academy creates one or more drop-in sessions (with optional recurrence)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  academyId: { type: 'string' },
                  sport: { type: 'string' },
                  courtNumber: { type: 'integer' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  skillLevel: { type: 'string' },
                  date: { type: 'string', format: 'date', description: 'First occurrence date (YYYY-MM-DD)' },
                  startTime: { type: 'string', description: 'HH:MM' },
                  endTime: { type: 'string', description: 'HH:MM' },
                  maxParticipants: { type: 'integer' },
                  pricePerParticipant: { type: 'number' },
                  recurrenceType: { type: 'string', enum: ['none', 'daily', 'weekly'], default: 'none' },
                  recurrenceDays: {
                    type: 'array',
                    items: { type: 'integer', minimum: 0, maximum: 6 },
                    description: 'Days of week (0=Sun … 6=Sat) for weekly recurrence',
                  },
                  recurrenceUntil: { type: 'string', format: 'date', description: 'Last date to generate instances (YYYY-MM-DD)' },
                },
                required: ['academyId', 'sport', 'courtNumber', 'date', 'startTime', 'endTime', 'maxParticipants'],
              },
            },
          },
        },
        responses: {
          '201': { description: 'Drop-in session(s) created' },
          '400': { description: 'Validation error or slot conflict' },
          '403': { description: 'Not authorised to manage this academy' },
          '404': { description: 'Academy or sport not found' },
        },
      },
    },
    '/api/dropin/academy/{academyId}': {
      get: {
        tags: ['Drop-In'],
        summary: 'Get all active drop-ins for an academy (for calendar view)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'academyId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'startDate', in: 'query', required: false, schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', required: false, schema: { type: 'string', format: 'date' } },
          { name: 'sport', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Drop-ins returned' },
          '403': { description: 'Not authorised' },
          '404': { description: 'Academy not found' },
        },
      },
    },
    '/api/dropin/all': {
      get: {
        tags: ['Drop-In'],
        summary: 'Get all active upcoming drop-ins for user discovery',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'sport', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Drop-ins returned' },
        },
      },
    },
    '/api/dropin/user-activities': {
      get: {
        tags: ['Drop-In'],
        summary: 'Get drop-ins joined by the authenticated user',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Joined drop-ins returned' },
        },
      },
    },
    '/api/dropin/share/{shareCode}': {
      get: {
        tags: ['Drop-In'],
        summary: 'Get drop-in details by share code (public/user view)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'shareCode', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Drop-in details returned' },
          '404': { description: 'Drop-in not found or not active' },
        },
      },
    },
    '/api/dropin/{dropInId}': {
      get: {
        tags: ['Drop-In'],
        summary: 'Get a single drop-in by ID',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'dropInId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Drop-in returned' },
          '404': { description: 'Drop-in not found' },
        },
      },
      put: {
        tags: ['Drop-In'],
        summary: 'Academy edits a drop-in occurrence or updates this-and-future series',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'dropInId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  scope: { type: 'string', enum: ['single', 'future'], default: 'single' },
                  sport: { type: 'string' },
                  courtNumber: { type: 'integer' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  skillLevel: { type: 'string' },
                  date: { type: 'string', format: 'date' },
                  startTime: { type: 'string', example: '18:00' },
                  endTime: { type: 'string', example: '19:30' },
                  maxParticipants: { type: 'integer' },
                  pricePerParticipant: { type: 'number' },
                  recurrenceType: { type: 'string', enum: ['none', 'daily', 'weekly'] },
                  recurrenceDays: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
                  recurrenceUntil: { type: 'string', format: 'date' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Drop-in updated successfully' },
          '400': { description: 'Validation error or slot conflict' },
          '403': { description: 'Not authorised' },
          '404': { description: 'Drop-in not found' },
        },
      },
      delete: {
        tags: ['Drop-In'],
        summary: 'Academy cancels a single drop-in occurrence',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'dropInId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Drop-in cancelled' },
          '403': { description: 'Not authorised' },
          '404': { description: 'Drop-in not found' },
        },
      },
    },
    '/api/dropin/series/{seriesId}/from/{fromDate}': {
      delete: {
        tags: ['Drop-In'],
        summary: 'Academy cancels all future occurrences in a series from a given date',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'seriesId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'fromDate', in: 'path', required: true, schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          '200': { description: 'Future series occurrences cancelled' },
          '403': { description: 'Not authorised' },
          '404': { description: 'Series not found' },
        },
      },
    },
    '/api/dropin/{dropInId}/share-link': {
      get: {
        tags: ['Drop-In'],
        summary: 'Get (or generate) the share code for a drop-in',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'dropInId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Share code returned',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { shareCode: { type: 'string' } },
                },
              },
            },
          },
          '403': { description: 'Not authorised' },
          '404': { description: 'Drop-in not found' },
        },
      },
    },
    '/api/dropin/{dropInId}/request-join': {
      post: {
        tags: ['Drop-In'],
        summary: 'User sends a join request for a drop-in',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'dropInId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Join request sent' },
          '400': { description: 'Already joined, already requested, or drop-in full' },
          '404': { description: 'Drop-in not found or not active' },
        },
      },
    },
    '/api/dropin/{dropInId}/approve/{userId}': {
      post: {
        tags: ['Drop-In'],
        summary: 'Academy approves a pending join request',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'dropInId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'User approved' },
          '400': { description: 'No pending request or drop-in full' },
          '403': { description: 'Not authorised' },
          '404': { description: 'Drop-in not found' },
        },
      },
    },
    '/api/dropin/{dropInId}/reject/{userId}': {
      post: {
        tags: ['Drop-In'],
        summary: 'Academy rejects a pending request or removes an approved participant',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'dropInId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Request rejected or participant removed' },
          '400': { description: 'User not in pending or joined list' },
          '403': { description: 'Not authorised' },
          '404': { description: 'Drop-in not found' },
        },
      },
    },

    // ─── Coaching ───────────────────────────────────────────────────────────
    '/api/coaching/create': {
      post: {
        tags: ['Coaching'],
        summary: 'Academy creates one or more coaching classes (with optional recurrence)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  academyId: { type: 'string' },
                  sport: { type: 'string' },
                  courtNumber: { type: 'integer' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  skillLevel: { type: 'string' },
                  coachName: { type: 'string' },
                  coachBio: { type: 'string' },
                  coachContact: { type: 'string' },
                  date: { type: 'string', format: 'date', description: 'First occurrence date (YYYY-MM-DD)' },
                  startTime: { type: 'string', description: 'HH:MM' },
                  endTime: { type: 'string', description: 'HH:MM' },
                  pricePerParticipant: { type: 'number' },
                  recurrenceType: { type: 'string', enum: ['none', 'daily', 'weekly'], default: 'none' },
                  recurrenceDays: {
                    type: 'array',
                    items: { type: 'integer', minimum: 0, maximum: 6 },
                    description: 'Days of week (0=Sun … 6=Sat) for weekly recurrence',
                  },
                  recurrenceUntil: { type: 'string', format: 'date', description: 'Last date to generate instances (YYYY-MM-DD)' },
                },
                required: ['academyId', 'sport', 'courtNumber', 'date', 'startTime', 'endTime'],
              },
            },
          },
        },
        responses: {
          '201': { description: 'Coaching class(es) created' },
          '400': { description: 'Validation error or slot conflict' },
          '403': { description: 'Not authorised to manage this academy' },
          '404': { description: 'Academy or sport not found' },
        },
      },
    },
    '/api/coaching/academy/{academyId}': {
      get: {
        tags: ['Coaching'],
        summary: 'Get all active coaching classes for an academy (calendar view)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'academyId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'startDate', in: 'query', required: false, schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', required: false, schema: { type: 'string', format: 'date' } },
          { name: 'sport', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Coaching classes returned' },
          '403': { description: 'Not authorised' },
          '404': { description: 'Academy not found' },
        },
      },
    },
    '/api/coaching/academy/{academyId}/programs': {
      get: {
        tags: ['Coaching'],
        summary: 'Get coaching programs (series-grouped) for an academy',
        description: 'Returns one program entry per coaching series (or standalone session). Each program includes aggregate enrolled/pending counts and a sessions list.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'academyId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'sport', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Coaching programs returned' },
          '403': { description: 'Not authorised' },
          '404': { description: 'Academy not found' },
        },
      },
    },
    '/api/coaching/all': {
      get: {
        tags: ['Coaching'],
        summary: 'Get all active upcoming coaching classes for user discovery',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'sport', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Coaching classes returned' },
        },
      },
    },
    '/api/coaching/user-activities': {
      get: {
        tags: ['Coaching'],
        summary: 'Get coaching classes joined by the authenticated user',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Joined coaching classes returned' },
        },
      },
    },
    '/api/coaching/share/{shareCode}': {
      get: {
        tags: ['Coaching'],
        summary: 'Get coaching class details by share code (public/user view)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'shareCode', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Coaching class details returned' },
          '404': { description: 'Coaching class not found or not active' },
        },
      },
    },
    '/api/coaching/{coachingId}': {
      get: {
        tags: ['Coaching'],
        summary: 'Get a single coaching class by ID',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'coachingId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Coaching class returned' },
          '404': { description: 'Coaching class not found' },
        },
      },
      put: {
        tags: ['Coaching'],
        summary: 'Academy edits a coaching class or updates this-and-future series',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'coachingId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  scope: { type: 'string', enum: ['single', 'future'], default: 'single' },
                  sport: { type: 'string' },
                  courtNumber: { type: 'integer' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  skillLevel: { type: 'string' },
                  coachName: { type: 'string' },
                  coachBio: { type: 'string' },
                  coachContact: { type: 'string' },
                  date: { type: 'string', format: 'date' },
                  startTime: { type: 'string', example: '18:00' },
                  endTime: { type: 'string', example: '19:30' },
                  pricePerParticipant: { type: 'number' },
                  recurrenceType: { type: 'string', enum: ['none', 'daily', 'weekly'] },
                  recurrenceDays: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
                  recurrenceUntil: { type: 'string', format: 'date' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Coaching class updated successfully' },
          '400': { description: 'Validation error or slot conflict' },
          '403': { description: 'Not authorised' },
          '404': { description: 'Coaching class not found' },
        },
      },
      delete: {
        tags: ['Coaching'],
        summary: 'Academy cancels a single coaching class occurrence',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'coachingId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Coaching class cancelled' },
          '403': { description: 'Not authorised' },
          '404': { description: 'Coaching class not found' },
        },
      },
    },
    '/api/coaching/series/{seriesId}/from/{fromDate}': {
      delete: {
        tags: ['Coaching'],
        summary: 'Academy cancels all future occurrences in a coaching series from a given date',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'seriesId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'fromDate', in: 'path', required: true, schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          '200': { description: 'Future coaching classes cancelled' },
          '403': { description: 'Not authorised' },
          '404': { description: 'Series not found' },
        },
      },
    },
    '/api/coaching/{coachingId}/share-link': {
      get: {
        tags: ['Coaching'],
        summary: 'Get (or generate) the share code for a coaching class',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'coachingId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Share code returned',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { shareCode: { type: 'string' } },
                },
              },
            },
          },
          '403': { description: 'Not authorised' },
          '404': { description: 'Coaching class not found' },
        },
      },
    },
    '/api/coaching/{coachingId}/request-join': {
      post: {
        tags: ['Coaching'],
        summary: 'User sends a join request for a coaching class',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'coachingId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Join request sent' },
          '400': { description: 'Already joined or already requested' },
          '404': { description: 'Coaching class not found or not active' },
        },
      },
    },
    '/api/coaching/{coachingId}/approve/{userId}': {
      post: {
        tags: ['Coaching'],
        summary: 'Academy approves a pending coaching join request',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'coachingId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'User approved' },
          '400': { description: 'No pending request' },
          '403': { description: 'Not authorised' },
          '404': { description: 'Coaching class not found' },
        },
      },
    },
    '/api/coaching/{coachingId}/reject/{userId}': {
      post: {
        tags: ['Coaching'],
        summary: 'Academy rejects pending coaching request or removes an approved participant',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'coachingId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Request rejected or participant removed' },
          '400': { description: 'User not in pending or joined list' },
          '403': { description: 'Not authorised' },
          '404': { description: 'Coaching class not found' },
        },
      },
    },
  },
};

function setupSwagger(app) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

module.exports = setupSwagger;