import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const customerOrderItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },

    productName: {
      type: String,
      required: true,
      trim: true,
    },

    productOptionName: {
      type: String,
      required: true,
      trim: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    allocatedQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    fulfilledQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    total: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: true,
  },
);

const customerOrderSchema = new Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    packagingCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    orderBy: {
      type: String,
      required: true,
      trim: true,
    },

    buyer: {
      firstName: {
        type: String,
        trim: true,
        default: '',
      },

      lastName: {
        type: String,
        trim: true,
        default: '',
      },

      email: {
        type: String,
        trim: true,
        default: '',
      },

      phone: {
        type: String,
        trim: true,
        default: '',
      },
    },

    orderDate: {
      type: Date,
      required: true,
    },

    fulfillmentDueDate: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: [
        'pending',
        'partial',
        'fulfilled',
        'cancelled',
        'delivered',
        'completed',
      ],
      default: 'pending',
    },

    paymentStatus: {
      type: String,
      trim: true,
      default: '',
    },

    shippingStatus: {
      type: String,
      trim: true,
      default: '',
    },

    shippingMethod: {
      type: String,
      trim: true,
      default: '',
    },

    shippingAddress: {
      address1: {
        type: String,
        trim: true,
        default: '',
      },

      address2: {
        type: String,
        trim: true,
        default: '',
      },

      city: {
        type: String,
        trim: true,
        default: '',
      },

      state: {
        type: String,
        trim: true,
        default: '',
      },

      zip: {
        type: String,
        trim: true,
        default: '',
      },

      country: {
        type: String,
        trim: true,
        default: '',
      },
    },

    currency: {
      type: String,
      trim: true,
      default: 'USD',
    },

    subtotal: {
      type: Number,
      min: 0,
      default: 0,
    },

    shippingCost: {
      type: Number,
      min: 0,
      default: 0,
    },

    tax: {
      type: Number,
      min: 0,
      default: 0,
    },

    discount: {
      type: Number,
      min: 0,
      default: 0,
    },

    total: {
      type: Number,
      min: 0,
      default: 0,
    },

    note: {
      type: String,
      trim: true,
      default: '',
    },

    completionNotes: {
      type: String,
      trim: true,
      default: '',
    },

    items: {
      type: [customerOrderItemSchema],
      required: true,
      default: [],
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export type CustomerOrderItem = InferSchemaType<typeof customerOrderItemSchema>;

export type CustomerOrder = InferSchemaType<typeof customerOrderSchema>;

export const CustomerOrderModel: Model<CustomerOrder> =
  (mongoose.models.CustomerOrder as Model<CustomerOrder> | undefined) ??
  mongoose.model<CustomerOrder>('CustomerOrder', customerOrderSchema);
