import { CounterModel, mongoose } from '@fahrul-store/database';
const PACKAGING_COUNTER_ID = 'customer_order_packaging';
function numberToLetters(value) {
    let result = '';
    let number = value;
    while (number > 0) {
        number--;
        result = String.fromCharCode(65 + (number % 26)) + result;
        number = Math.floor(number / 26);
    }
    return result;
}
export async function generatePackagingCode(session) {
    const options = {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        ...(session ? { session } : {}),
    };
    const counter = await CounterModel.findOneAndUpdate({
        _id: PACKAGING_COUNTER_ID,
    }, {
        $inc: {
            sequence: 1,
        },
    }, options);
    if (!counter) {
        throw new Error('Failed to generate packaging code.');
    }
    const sequence = counter.sequence;
    const prefixNumber = Math.floor((sequence - 1) / 9999) + 1;
    const number = ((sequence - 1) % 9999) + 1;
    const prefix = numberToLetters(prefixNumber);
    return `${prefix}-${String(number).padStart(4, '0')}`;
}
//# sourceMappingURL=generate-packaging-code.js.map