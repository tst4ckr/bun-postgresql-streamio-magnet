/**
 * IPTV Validation Service
 * 
 * Provides comprehensive validation for IPTV channel data using schema-based validation.
 * Implements modular validation patterns for different data types and sources.
 * 
 * @module ValidationService
 */

/**
 * Base validation result structure
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Whether the validation passed
 * @property {Array<ValidationError>} errors - Array of validation errors
 * @property {*} data - The validated/transformed data
 * @property {Object} metadata - Additional validation metadata
 */

/**
 * Validation error structure
 * @typedef {Object} ValidationError
 * @property {string} field - The field that failed validation
 * @property {string} message - Human-readable error message
 * @property {string} code - Error code for programmatic handling
 * @property {*} value - The invalid value
 * @property {string} path - Dot-notation path to the field
 */

/**
 * Channel validation schema definition
 * @typedef {Object} ChannelSchema
 * @property {string} name - Channel name (required, non-empty)
 * @property {string} url - Stream URL (required, valid URL)
 * @property {string} [logo] - Logo URL (optional, valid URL if provided)
 * @property {string} [group] - Channel group/category
 * @property {string} [language] - Channel language code
 * @property {string} [country] - Country code
 * @property {number} [tvg_id] - TVG ID for EPG
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * Core validation service for IPTV data
 */
class ValidationService {
    constructor(options = {}) {
        this.options = {
            strictMode: options.strictMode || false,
            allowEmptyValues: options.allowEmptyValues || false,
            customValidators: options.customValidators || {},
            transformData: options.transformData !== false,
            ...options
        };
        
        this.validators = new Map();
        this.schemas = new Map();
        this._initializeBuiltInValidators();
        this._initializeSchemas();
    }

    /**
     * Initialize built-in validators
     * @private
     */
    _initializeBuiltInValidators() {
        // String validators
        this.validators.set('string', (value, options = {}) => {
            if (typeof value !== 'string') {
                return { isValid: false, message: 'Value must be a string' };
            }
            if (options.minLength && value.length < options.minLength) {
                return { isValid: false, message: `String must be at least ${options.minLength} characters` };
            }
            if (options.maxLength && value.length > options.maxLength) {
                return { isValid: false, message: `String must be at most ${options.maxLength} characters` };
            }
            if (options.pattern && !options.pattern.test(value)) {
                return { isValid: false, message: 'String does not match required pattern' };
            }
            return { isValid: true, value: options.trim ? value.trim() : value };
        });

        // URL validator
        this.validators.set('url', (value, options = {}) => {
            if (typeof value !== 'string') {
                return { isValid: false, message: 'URL must be a string' };
            }
            
            try {
                const url = new URL(value);
                if (options.protocols && !options.protocols.includes(url.protocol.slice(0, -1))) {
                    return { isValid: false, message: `URL protocol must be one of: ${options.protocols.join(', ')}` };
                }
                return { isValid: true, value: url.toString() };
            } catch (error) {
                return { isValid: false, message: 'Invalid URL format' };
            }
        });

        // Email validator
        this.validators.set('email', (value) => {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
                return { isValid: false, message: 'Invalid email format' };
            }
            return { isValid: true, value };
        });

        // Number validator
        this.validators.set('number', (value, options = {}) => {
            const num = Number(value);
            if (isNaN(num)) {
                return { isValid: false, message: 'Value must be a number' };
            }
            if (options.min !== undefined && num < options.min) {
                return { isValid: false, message: `Number must be at least ${options.min}` };
            }
            if (options.max !== undefined && num > options.max) {
                return { isValid: false, message: `Number must be at most ${options.max}` };
            }
            if (options.integer && !Number.isInteger(num)) {
                return { isValid: false, message: 'Number must be an integer' };
            }
            return { isValid: true, value: num };
        });

        // Array validator
        this.validators.set('array', (value, options = {}) => {
            if (!Array.isArray(value)) {
                return { isValid: false, message: 'Value must be an array' };
            }
            if (options.minLength && value.length < options.minLength) {
                return { isValid: false, message: `Array must have at least ${options.minLength} items` };
            }
            if (options.maxLength && value.length > options.maxLength) {
                return { isValid: false, message: `Array must have at most ${options.maxLength} items` };
            }
            return { isValid: true, value };
        });

        // Object validator
        this.validators.set('object', (value) => {
            if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                return { isValid: false, message: 'Value must be an object' };
            }
            return { isValid: true, value };
        });

        // Boolean validator
        this.validators.set('boolean', (value) => {
            if (typeof value === 'boolean') {
                return { isValid: true, value };
            }
            if (typeof value === 'string') {
                const lower = value.toLowerCase();
                if (['true', '1', 'yes', 'on'].includes(lower)) {
                    return { isValid: true, value: true };
                }
                if (['false', '0', 'no', 'off'].includes(lower)) {
                    return { isValid: true, value: false };
                }
            }
            return { isValid: false, message: 'Value must be a boolean' };
        });

        // Language code validator
        this.validators.set('languageCode', (value) => {
            const langRegex = /^[a-z]{2}(-[A-Z]{2})?$/;
            if (!langRegex.test(value)) {
                return { isValid: false, message: 'Invalid language code format (expected: en, en-US)' };
            }
            return { isValid: true, value };
        });

        // Country code validator
        this.validators.set('countryCode', (value) => {
            const countryRegex = /^[A-Z]{2}$/;
            if (!countryRegex.test(value)) {
                return { isValid: false, message: 'Invalid country code format (expected: US, ES)' };
            }
            return { isValid: true, value };
        });
    }

    /**
     * Initialize validation schemas
     * @private
     */
    _initializeSchemas() {
        // Channel schema
        this.schemas.set('channel', {
            name: { 
                type: 'string', 
                required: true, 
                options: { minLength: 1, trim: true } 
            },
            url: { 
                type: 'url', 
                required: true, 
                options: { protocols: ['http', 'https', 'rtmp', 'rtsp'] } 
            },
            logo: { 
                type: 'url', 
                required: false, 
                options: { protocols: ['http', 'https'] } 
            },
            group: { 
                type: 'string', 
                required: false, 
                options: { trim: true } 
            },
            language: { 
                type: 'languageCode', 
                required: false 
            },
            country: { 
                type: 'countryCode', 
                required: false 
            },
            tvg_id: { 
                type: 'number', 
                required: false, 
                options: { integer: true, min: 0 } 
            },
            metadata: { 
                type: 'object', 
                required: false 
            }
        });

        // Batch validation schema
        this.schemas.set('channelBatch', {
            channels: {
                type: 'array',
                required: true,
                options: { minLength: 1 }
            },
            source: {
                type: 'string',
                required: false,
                options: { trim: true }
            },
            timestamp: {
                type: 'number',
                required: false
            }
        });

        // Configuration schema
        this.schemas.set('config', {
            validation: {
                type: 'object',
                required: false
            },
            processing: {
                type: 'object',
                required: false
            },
            output: {
                type: 'object',
                required: false
            }
        });
    }

    /**
     * Validate a single value against a validator
     * @param {*} value - Value to validate
     * @param {string} validatorName - Name of the validator
     * @param {Object} options - Validation options
     * @returns {ValidationResult}
     */
    validateValue(value, validatorName, options = {}) {
        const validator = this.validators.get(validatorName) || this.options.customValidators[validatorName];
        
        if (!validator) {
            return {
                isValid: false,
                errors: [{
                    field: 'validator',
                    message: `Unknown validator: ${validatorName}`,
                    code: 'UNKNOWN_VALIDATOR',
                    value: validatorName,
                    path: ''
                }],
                data: value,
                metadata: { validatorName }
            };
        }

        try {
            const result = validator(value, options);
            
            if (result.isValid) {
                return {
                    isValid: true,
                    errors: [],
                    data: this.options.transformData ? result.value : value,
                    metadata: { validatorName, transformed: result.value !== value }
                };
            } else {
                return {
                    isValid: false,
                    errors: [{
                        field: 'value',
                        message: result.message,
                        code: 'VALIDATION_FAILED',
                        value,
                        path: ''
                    }],
                    data: value,
                    metadata: { validatorName }
                };
            }
        } catch (error) {
            return {
                isValid: false,
                errors: [{
                    field: 'validator',
                    message: `Validator error: ${error.message}`,
                    code: 'VALIDATOR_ERROR',
                    value,
                    path: ''
                }],
                data: value,
                metadata: { validatorName, error: error.message }
            };
        }
    }

    /**
     * Validate an object against a schema
     * @param {Object} data - Data to validate
     * @param {string|Object} schema - Schema name or schema definition
     * @returns {ValidationResult}
     */
    validateSchema(data, schema) {
        const schemaDefinition = typeof schema === 'string' 
            ? this.schemas.get(schema) 
            : schema;

        if (!schemaDefinition) {
            return {
                isValid: false,
                errors: [{
                    field: 'schema',
                    message: `Unknown schema: ${schema}`,
                    code: 'UNKNOWN_SCHEMA',
                    value: schema,
                    path: ''
                }],
                data,
                metadata: { schema }
            };
        }

        const errors = [];
        const validatedData = {};
        const metadata = { schema, fields: {} };

        // Validate each field in the schema
        for (const [fieldName, fieldSchema] of Object.entries(schemaDefinition)) {
            const fieldPath = fieldName;
            const fieldValue = data[fieldName];

            // Check required fields
            if (fieldSchema.required && (fieldValue === undefined || fieldValue === null)) {
                if (!this.options.allowEmptyValues || fieldValue === undefined) {
                    errors.push({
                        field: fieldName,
                        message: `Field '${fieldName}' is required`,
                        code: 'REQUIRED_FIELD',
                        value: fieldValue,
                        path: fieldPath
                    });
                    continue;
                }
            }

            // Skip validation for undefined optional fields
            if (!fieldSchema.required && fieldValue === undefined) {
                continue;
            }

            // Validate field value
            const fieldResult = this.validateValue(fieldValue, fieldSchema.type, fieldSchema.options);
            
            if (fieldResult.isValid) {
                validatedData[fieldName] = fieldResult.data;
                metadata.fields[fieldName] = fieldResult.metadata;
            } else {
                // Update error paths
                fieldResult.errors.forEach(error => {
                    errors.push({
                        ...error,
                        field: fieldName,
                        path: fieldPath
                    });
                });
            }
        }

        // Check for extra fields in strict mode
        if (this.options.strictMode) {
            for (const fieldName of Object.keys(data)) {
                if (!schemaDefinition[fieldName]) {
                    errors.push({
                        field: fieldName,
                        message: `Unexpected field '${fieldName}' in strict mode`,
                        code: 'UNEXPECTED_FIELD',
                        value: data[fieldName],
                        path: fieldName
                    });
                }
            }
        } else {
            // Include extra fields in non-strict mode
            for (const [fieldName, fieldValue] of Object.entries(data)) {
                if (!schemaDefinition[fieldName]) {
                    validatedData[fieldName] = fieldValue;
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            data: validatedData,
            metadata
        };
    }

    /**
     * Validate IPTV channel data
     * @param {Object} channelData - Channel data to validate
     * @returns {ValidationResult}
     */
    validateChannel(channelData) {
        return this.validateSchema(channelData, 'channel');
    }

    /**
     * Validate batch of IPTV channels
     * @param {Array} channels - Array of channel data
     * @returns {ValidationResult}
     */
    validateChannelBatch(channels) {
        const batchResult = this.validateSchema({ channels }, 'channelBatch');
        
        if (!batchResult.isValid) {
            return batchResult;
        }

        const validatedChannels = [];
        const errors = [];
        const metadata = { 
            totalChannels: channels.length, 
            validChannels: 0, 
            invalidChannels: 0,
            channelResults: []
        };

        channels.forEach((channel, index) => {
            const channelResult = this.validateChannel(channel);
            metadata.channelResults.push(channelResult.metadata);
            
            if (channelResult.isValid) {
                validatedChannels.push(channelResult.data);
                metadata.validChannels++;
            } else {
                metadata.invalidChannels++;
                // Add index to error paths
                channelResult.errors.forEach(error => {
                    errors.push({
                        ...error,
                        path: `channels[${index}].${error.path}`,
                        field: `channels[${index}].${error.field}`
                    });
                });
            }
        });

        return {
            isValid: errors.length === 0,
            errors,
            data: { channels: validatedChannels },
            metadata
        };
    }

    /**
     * Add custom validator
     * @param {string} name - Validator name
     * @param {Function} validator - Validator function
     */
    addValidator(name, validator) {
        if (typeof validator !== 'function') {
            throw new Error('Validator must be a function');
        }
        this.validators.set(name, validator);
    }

    /**
     * Add custom schema
     * @param {string} name - Schema name
     * @param {Object} schema - Schema definition
     */
    addSchema(name, schema) {
        if (typeof schema !== 'object' || schema === null) {
            throw new Error('Schema must be an object');
        }
        this.schemas.set(name, schema);
    }

    /**
     * Get validation statistics
     * @returns {Object} Validation statistics
     */
    getStats() {
        return {
            validators: this.validators.size,
            schemas: this.schemas.size,
            options: this.options
        };
    }
}

/**
 * Factory for creating validation service instances
 */
class ValidationServiceFactory {
    /**
     * Create a standard validation service
     * @param {Object} options - Configuration options
     * @returns {ValidationService}
     */
    static createStandard(options = {}) {
        return new ValidationService({
            strictMode: false,
            allowEmptyValues: false,
            transformData: true,
            ...options
        });
    }

    /**
     * Create a strict validation service
     * @param {Object} options - Configuration options
     * @returns {ValidationService}
     */
    static createStrict(options = {}) {
        return new ValidationService({
            strictMode: true,
            allowEmptyValues: false,
            transformData: true,
            ...options
        });
    }

    /**
     * Create a lenient validation service
     * @param {Object} options - Configuration options
     * @returns {ValidationService}
     */
    static createLenient(options = {}) {
        return new ValidationService({
            strictMode: false,
            allowEmptyValues: true,
            transformData: false,
            ...options
        });
    }

    /**
     * Create validation service for testing
     * @param {Object} options - Configuration options
     * @returns {ValidationService}
     */
    static createForTesting(options = {}) {
        return new ValidationService({
            strictMode: true,
            allowEmptyValues: false,
            transformData: true,
            customValidators: {
                // Test-specific validators
                mockUrl: (value) => ({ isValid: true, value: `mock://${value}` }),
                testString: (value) => ({ isValid: typeof value === 'string', value })
            },
            ...options
        });
    }
}

export {
    ValidationService,
    ValidationServiceFactory
};