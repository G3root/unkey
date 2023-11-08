

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { type App } from "@/pkg/hono/app";
import { GlobalContext } from "@/pkg/context/global";

import { UnkeyApiError, handleZodError, openApiErrorResponses } from "@/pkg/errors"


const route = createRoute({
  method: "post",
  path: "/v1/keys.verifyKey",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            apiId: z.string().min(1).optional().openapi({
              description: `The id of the api where the key belongs to. This is optional for now but will be required soon.
The key will be verified against the api's configuration. If the key does not belong to the api, the verification will fail.`,
              example: "api_1234",

            }),
            key: z.string().min(1).openapi({
              description: "The key to verify",
              example: "sk_1234"
            })
          }),
        },
      }
    }

  },
  responses: {
    200: {
      description: "The verification result",
      content: {
        "application/json": {
          schema: z.object({
            valid: z.boolean().openapi({
              description: `Whether the key is valid or not.
A key could be invalid for a number of reasons, for example if it has expired, has no more verifications left or if it has been deleted.`,
              example: true
            }),
            name: z.string().optional().openapi({
              description: "The name of the key, give keys a name to easily identifiy their purpose",
              example: "Customer X"
            }),
            ownerId: z.string().optional().openapi({
              description: "The id of the tenant associated with this key. Use whatever reference you have in your system to identify the tenant. When verifying the key, we will send this field back to you, so you know who is accessing your API.",
              example: "user_123"
            }),
            meta: z.record(z.unknown()).optional().openapi({
              description: "Any additional metadata you want to store with the key",
              example: {
                "roles": ["admin", "user"],
                "stripeCustomerId": "cus_1234"
              }
            }),
            createdAt: z.number().openapi({
              description: "The unix timestamp in milliseconds when the key was created",
              example: Date.now()
            }),
            deletedAt: z.number().optional().openapi({
              description: "The unix timestamp in milliseconds when the key was deleted. We don't delete the key outright, you can restore it later.",
              example: Date.now()
            }),
            expiresAt: z.number().optional().openapi({
              description: "The unix timestamp in milliseconds when the key will expire. If this field is null or undefined, the key is not expiring.",
              example: Date.now()
            }),
            ratelimit: z.object({
              limit: z.number().openapi({
                description: "Maximum number of requests that can be made inside a window",
                example: 10
              }),
              remaining: z.number().openapi({
                description: "Remaining requests after this verification",
                example: 9
              }),
              reset: z.number().openapi({
                description: "Unix timestamp in milliseconds when the ratelimit will reset",
                example: Date.now() + 1000 * 60 * 60
              })
            }).optional().openapi({
              description: "The ratelimit configuration for this key. If this field is null or undefined, the key has no ratelimit.",
              example: {
                limit: 10,
                remaining: 9,
                reset: Date.now() + 1000 * 60 * 60
              }
            }),
            remaining: z.number().optional().openapi({
              description: "The number of requests that can be made with this key before it becomes invalid. If this field is null or undefined, the key has no request limit.",
              example: 1000
            }),
            code: z.enum(["NOT_FOUND", "FORBIDDEN", "KEY_USAGE_EXCEEDED", "RATELIMITED"]).openapi({
              description: `If the key is invalid this field will be set to the reason why it is invalid.
Possible values are:
- NOT_FOUND: the key does not exist or has expired
- FORBIDDEN: the key is not allowed to access the api
- KEY_USAGE_EXCEEDED: the key has exceeded its request limit
- RATELIMITED: the key has been ratelimited,
`,
              example: "NOT_FOUND"
            })
          }),
        },
      },

    },
    ...openApiErrorResponses

  },
});


export const registerV1KeysVerifyKey = (gCtx: GlobalContext, app: App) => app.openapi(route,
  async (c) => {
    const { apiId, key } = c.req.valid("json")


    const { value, error } = await gCtx.keyService.verifyKey(c, { key, apiId })
    if (error) {
      throw new UnkeyApiError({ code: "INTERNAL_SERVER_ERROR", message: error.message })
    }
    if (!value.valid) {
      return c.jsonT({
        valid: false,
        code: value.code,
      })
    }




    return c.jsonT({
      valid: true,
      ownerId: value.ownerId,
      meta: value.meta,
      expiresAt: value.expires,
      remaining: value.remaining,
    })
  },
);