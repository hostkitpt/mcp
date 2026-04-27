#!/usr/bin/env node

const API_KEY = process.env.HOSTKIT_API_KEY ?? "";
const BASE_URL = (process.env.HOSTKIT_API_BASE_URL ?? "https://app.hostkit.pt/api").replace(/\/+$/, "");
const RATE_LIMIT_MS = Number(process.env.HOSTKIT_RATE_LIMIT_MS ?? 6000);
const API_DOCS_URL = "https://hostkit.pt/api/";

if (!API_KEY) {
  console.error("HOSTKIT_API_KEY is required");
  process.exit(1);
}

let nextRequestAt = 0;

const textResult = (payload, isError = false) => ({
  content: [
    {
      type: "text",
      text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
    },
  ],
  isError,
});

const stringSchema = (description) => ({ type: "string", description });
const numberOrStringSchema = (description) => ({
  anyOf: [{ type: "string" }, { type: "number" }],
  description,
});

const tools = [
  tool("hostkit_get_license", "Get Hostkit account license plan and expiration date.", {}),
  tool("hostkit_get_properties", "List all properties visible to the configured API key.", {}),
  tool("hostkit_get_property", "Get details for one Hostkit property.", {
    id: numberOrStringSchema("Ignored by the current Hostkit API; the API key selects the property."),
  }),
  tool("hostkit_get_reservations", "List reservations filtered by check-in, checkout, or reservation date.", {
    from_date: stringSchema("Check-in date in YYYY-MM-DD format."),
    to_date: stringSchema("Checkout date in YYYY-MM-DD format."),
    date_filter: {
      type: "string",
      enum: ["checkin", "checkout"],
      description: "Optional date filter mode. Use checkin to filter from_date/to_date against check-in dates, or checkout to filter against checkout dates.",
    },
    reservation_date: stringSchema("Reservation date in YYYY-MM-DD format."),
    get_archived: { type: "boolean" },
    room: stringSchema("Optional room filter."),
  }),
  tool("hostkit_get_reservation", "Get one reservation by Hostkit reservation code.", {
    rcode: stringSchema("Hostkit reservation code."),
    get_archived: { type: "boolean" },
  }, ["rcode"]),
  tool("hostkit_get_reservation_by_cm_id", "Get one reservation by channel manager name and reservation ID.", {
    channelmanager: stringSchema("Channel manager name, for example avantio."),
    id: numberOrStringSchema("Channel manager reservation ID."),
  }, ["channelmanager", "id"]),
  tool("hostkit_get_payments", "Get all payments for one reservation.", {
    rcode: stringSchema("Hostkit reservation code."),
  }, ["rcode"]),
  tool("hostkit_get_online_checkin", "Get online check-in link and status for one reservation.", {
    rcode: stringSchema("Hostkit reservation code."),
  }, ["rcode"]),
  tool("hostkit_get_keycode", "Get the smartlock keycode or invite code for one reservation.", {
    rcode: stringSchema("Hostkit reservation code."),
    provider: { type: "string", enum: ["nuki", "homeit", "ttlock", "salto", "omnitec", "voyager", "tedee"] },
  }, ["rcode", "provider"]),
  tool("hostkit_get_invoices", "List invoices or filter a specific invoice.", {
    invoicing_nif: stringSchema("Invoicing VAT ID."),
    series: stringSchema("Invoice series."),
    id: numberOrStringSchema("Invoice ID."),
    customer_id: stringSchema("Invoice customer ID."),
    date_start: numberOrStringSchema("Start date as Unix timestamp."),
    date_end: numberOrStringSchema("End date as Unix timestamp."),
    doc_type: stringSchema("Invoice type, for example FR or FT."),
    source: stringSchema("Invoice source."),
  }),
  tool("hostkit_get_reservation_invoices", "List invoices for one reservation.", {
    rcode: stringSchema("Hostkit reservation code."),
    invoicing_nif: stringSchema("Invoicing VAT ID."),
  }, ["rcode"]),
  tool("hostkit_get_receipts", "List receipts or filter a specific receipt.", invoiceListProperties()),
  tool("hostkit_get_credit_notes", "List credit notes or filter a specific credit note.", {
    invoice_type: stringSchema("Invoice type."),
    ...invoiceListProperties(),
  }),
  tool("hostkit_get_saft", "Get a generated SAF-T file as base64 content.", {
    invoicing_nif: stringSchema("Invoicing VAT ID."),
    year: numberOrStringSchema("Year."),
    month: numberOrStringSchema("Month."),
  }, ["invoicing_nif", "year", "month"]),
  tool("hostkit_get_expenses", "List expenses by document date range.", {
    date_start: numberOrStringSchema("Document start date as Unix timestamp."),
    date_end: numberOrStringSchema("Document end date as Unix timestamp."),
  }, ["date_start", "date_end"]),
  tool("hostkit_get_last_siba_date", "Get the last successfully submitted SIBA bulletin date.", {}),
  tool("hostkit_validate_siba", "Validate SIBA data for one reservation or for explicit guest data without submitting it.", {
    rcode: stringSchema("Hostkit reservation code."),
    ...sibaGuestProperties(),
  }),
  tool("hostkit_add_property", "Create a property and return the new property API key.", propertyProperties(), [
    "property_name",
    "address",
    "zip",
    "city",
  ]),
  tool("hostkit_update_property", "Update the property attached to the configured API key.", propertyProperties()),
  tool("hostkit_add_reservation", "Create a reservation in Hostkit.", reservationWriteProperties(), [
    "rcode",
    "check_in",
    "check_out",
  ]),
  tool("hostkit_update_reservation", "Update a reservation in Hostkit.", reservationWriteProperties(), ["rcode"]),
  tool("hostkit_cancel_reservation", "Move a reservation to Hostkit cancellations.", {
    rcode: stringSchema("Hostkit reservation code."),
  }, ["rcode"]),
  tool("hostkit_delete_reservation", "Permanently delete a reservation and related records.", {
    rcode: stringSchema("Hostkit reservation code."),
  }, ["rcode"]),
  tool("hostkit_add_guest", "Add guest data to a reservation.", {
    rcode: stringSchema("Hostkit reservation code."),
    ...sibaGuestProperties(),
  }, ["rcode", ...sibaGuestRequired()]),
  tool("hostkit_remove_guest", "Remove one guest from a reservation by name or first_name/last_name.", {
    rcode: stringSchema("Hostkit reservation code."),
    name: stringSchema("Full guest name. Alternative to first_name and last_name."),
    first_name: stringSchema("Guest first name."),
    last_name: stringSchema("Guest last name."),
  }, ["rcode"]),
  tool("hostkit_remove_all_guests", "Remove all guest data from one reservation.", {
    rcode: stringSchema("Hostkit reservation code."),
  }, ["rcode"]),
  tool("hostkit_add_reservation_extra", "Add an extra line to a reservation and create the product if needed.", {
    rcode: stringSchema("Hostkit reservation code."),
    extra_id: stringSchema("Extra product ID, max 20 chars, letters/numbers/_/- only."),
    extra_name: stringSchema("Extra name."),
    extra_vat: numberOrStringSchema("VAT rate."),
    extra_type: { type: "string", enum: ["S", "I", "P"], description: "S service, I tax, P product." },
    extra_total: numberOrStringSchema("Extra total."),
  }, ["rcode", "extra_id", "extra_name", "extra_vat", "extra_type", "extra_total"]),
  tool("hostkit_delete_reservation_extras", "Delete all extras from one reservation.", {
    rcode: stringSchema("Hostkit reservation code."),
  }, ["rcode"]),
  tool("hostkit_add_invoice", "Create an open invoice document.", invoiceProperties(), ["customer_id", "name", "country"]),
  tool("hostkit_add_invoice_line", "Add a line to an open invoice.", {
    ...invoiceDocumentRefProperties(),
    product_id: stringSchema("Product ID."),
    custom_descr: stringSchema("Line description."),
    qty: numberOrStringSchema("Quantity."),
    price: numberOrStringSchema("Unit price."),
    discount: numberOrStringSchema("Line discount."),
    vat: numberOrStringSchema("VAT rate."),
    reason_code: stringSchema("VAT exemption reason code, or empty string."),
    region: { type: "string", enum: ["PT", "PT-MA", "PT-AC"], description: "VAT region for auto-created products." },
    type: { type: "string", enum: ["S", "P", "I"], description: "Product type for auto-created products." },
  }, ["id", "product_id", "custom_descr", "qty", "price", "discount", "vat", "reason_code"]),
  tool("hostkit_close_invoice", "Close an open invoice and return its public URL/token.", {
    ...invoiceDocumentRefProperties(),
  }, ["id"]),
  tool("hostkit_delete_invoice", "Delete an open invoice.", {
    ...invoiceDocumentRefProperties(),
  }, ["id"]),
  tool("hostkit_add_receipt", "Create a receipt for an FT invoice.", {
    refseries: stringSchema("Referenced FT invoice series."),
    refid: numberOrStringSchema("Referenced FT invoice ID."),
    invoicing_nif: stringSchema("Invoicing VAT ID."),
  }, ["refseries", "refid"]),
  tool("hostkit_add_credit_note", "Create a credit note for a closed invoice.", {
    refseries: stringSchema("Referenced invoice series."),
    refid: numberOrStringSchema("Referenced invoice ID."),
    invoicing_nif: stringSchema("Invoicing VAT ID."),
    invoice_type: { type: "string", enum: ["FR", "FT"], description: "Referenced invoice type. Defaults to FR in Hostkit." },
  }, ["refseries", "refid"]),
  tool("hostkit_generate_saft", "Generate a SAF-T file for an invoicing account.", {
    invoicing_nif: stringSchema("Invoicing VAT ID."),
    year: numberOrStringSchema("Year."),
    month: numberOrStringSchema("Month."),
  }, ["invoicing_nif", "year", "month"]),
  tool("hostkit_send_siba", "Submit SIBA data for a reservation or explicit guest data.", {
    rcode: stringSchema("Hostkit reservation code."),
    ...sibaGuestProperties(),
  }),
];

const endpointByTool = {
  hostkit_get_license: "getLicense",
  hostkit_get_properties: "getProperties",
  hostkit_get_property: "getProperty",
  hostkit_get_reservations: "getReservations",
  hostkit_get_reservation: "getReservation",
  hostkit_get_reservation_by_cm_id: "getReservationByCmId",
  hostkit_get_payments: "getPayments",
  hostkit_get_online_checkin: "getOnlineCheckin",
  hostkit_get_keycode: "getKeycode",
  hostkit_get_invoices: "getInvoices",
  hostkit_get_reservation_invoices: "getReservationInvoices",
  hostkit_get_receipts: "getReceipts",
  hostkit_get_credit_notes: "getCreditNotes",
  hostkit_get_saft: "getSAFT",
  hostkit_get_expenses: "getExpenses",
  hostkit_get_last_siba_date: "getLastSIBADate",
  hostkit_validate_siba: "validateSIBA",
  hostkit_add_property: "addProperty",
  hostkit_update_property: "updateProperty",
  hostkit_add_reservation: "addReservation",
  hostkit_update_reservation: "updateReservation",
  hostkit_cancel_reservation: "cancelReservation",
  hostkit_delete_reservation: "deleteReservation",
  hostkit_add_guest: "addGuest",
  hostkit_remove_guest: "removeGuest",
  hostkit_remove_all_guests: "removeAllGuests",
  hostkit_add_reservation_extra: "addReservationExtra",
  hostkit_delete_reservation_extras: "deleteReservationExtras",
  hostkit_add_invoice: "addInvoice",
  hostkit_add_invoice_line: "addInvoiceLine",
  hostkit_close_invoice: "closeInvoice",
  hostkit_delete_invoice: "deleteInvoice",
  hostkit_add_receipt: "addReceipt",
  hostkit_add_credit_note: "addCreditNote",
  hostkit_generate_saft: "generateSAFT",
  hostkit_send_siba: "sendSIBA",
};

const toolByName = Object.fromEntries(tools.map((item) => [item.name, item]));

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.trim()) continue;
    await handleLine(line);
  }
});

async function handleLine(line) {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }

  if (request.id === undefined) {
    return;
  }

  try {
    if (request.method === "initialize") {
      send({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: request.params?.protocolVersion ?? "2024-11-05",
          capabilities: { resources: {}, tools: {} },
          serverInfo: { name: "hostkit-mcp", version: "0.1.0" },
        },
      });
      return;
    }

    if (request.method === "tools/list") {
      send({ jsonrpc: "2.0", id: request.id, result: { tools } });
      return;
    }

    if (request.method === "resources/list") {
      send({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          resources: [
            {
              uri: API_DOCS_URL,
              name: "Hostkit API Documentation",
              description: "Official Hostkit API documentation.",
              mimeType: "text/html",
            },
          ],
        },
      });
      return;
    }

    if (request.method === "resources/read") {
      const uri = request.params?.uri;
      if (uri !== API_DOCS_URL) {
        send({
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32602, message: `Unknown resource: ${uri}` },
        });
        return;
      }

      send({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          contents: [
            {
              uri: API_DOCS_URL,
              mimeType: "text/uri-list",
              text: API_DOCS_URL,
            },
          ],
        },
      });
      return;
    }

    if (request.method === "tools/call") {
      const name = request.params?.name;
      const endpoint = endpointByTool[name];
      const selectedTool = toolByName[name];
      if (!endpoint || !selectedTool) {
        send({ jsonrpc: "2.0", id: request.id, result: textResult(`Unknown tool: ${name}`, true) });
        return;
      }

      const args = request.params?.arguments ?? {};
      const validationError = validateToolArguments(selectedTool, args);
      if (validationError) {
        send({ jsonrpc: "2.0", id: request.id, result: textResult(validationError, true) });
        return;
      }

      const payload = await callHostkit(endpoint, args);
      send({ jsonrpc: "2.0", id: request.id, result: payload });
      return;
    }

    send({
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32601, message: `Method not found: ${request.method}` },
    });
  } catch (error) {
    send({
      jsonrpc: "2.0",
      id: request.id,
      result: textResult(error instanceof Error ? error.message : String(error), true),
    });
  }
}

async function callHostkit(endpoint, input = {}) {
  try {
    const payload = await hostkitGet(endpoint, input);
    return textResult(payload);
  } catch (error) {
    return textResult(
      {
        error: error instanceof Error ? error.message : String(error),
        endpoint,
      },
      true,
    );
  }
}

async function hostkitGet(endpoint, params = {}) {
  if (!/^[A-Za-z0-9_]+$/.test(endpoint)) {
    throw new Error(`Invalid endpoint name: ${endpoint}`);
  }

  await waitForRateLimit();

  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set("APIKEY", API_KEY);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, { method: "GET" });
  const text = await response.text();
  const payload = parsePayload(text);

  if (!response.ok) {
    throw new Error(`Hostkit returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }

  if (payload && typeof payload === "object" && "error" in payload) {
    throw new Error(String(payload.error));
  }

  return payload;
}

function parsePayload(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

async function waitForRateLimit() {
  const now = Date.now();
  const delay = Math.max(0, nextRequestAt - now);
  nextRequestAt = Math.max(now, nextRequestAt) + RATE_LIMIT_MS;

  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function tool(name, description, properties, required = []) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
  };
}

function validateToolArguments(selectedTool, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return "Tool arguments must be an object.";
  }

  const schema = selectedTool.inputSchema;
  for (const key of schema.required ?? []) {
    if (!(key in args) || args[key] === undefined || args[key] === null || args[key] === "") {
      if (allowsEmptyRequiredValue(selectedTool.name, key, args)) {
        continue;
      }
      return `Missing required argument: ${key}`;
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(args)) {
      if (!(key in schema.properties)) {
        return `Unknown argument for ${selectedTool.name}: ${key}`;
      }
    }
  }

  const alternativeError = validateAlternativeArguments(selectedTool.name, args);
  if (alternativeError) {
    return alternativeError;
  }

  return null;
}

function validateAlternativeArguments(toolName, args) {
  if (toolName === "hostkit_add_reservation" || toolName === "hostkit_add_guest") {
    return validateNameArgs(args);
  }

  if (toolName === "hostkit_get_reservations" && !args.from_date && !args.to_date && !args.reservation_date) {
    return "Missing required argument: provide at least one of from_date, to_date or reservation_date";
  }

  if (toolName === "hostkit_remove_guest") {
    if (args.name || (args.first_name && args.last_name)) {
      return null;
    }
    return "Missing required argument: provide name or first_name and last_name";
  }

  if (toolName === "hostkit_validate_siba" || toolName === "hostkit_send_siba") {
    if (args.rcode) {
      return null;
    }

    const missing = [...sibaGuestRequired(), "first_name", "last_name"].filter((key) => {
      if ((key === "first_name" || key === "last_name") && args.name) {
        return false;
      }
      return args[key] === undefined || args[key] === null || args[key] === "";
    });

    if (missing.length) {
      return `Missing required argument: provide rcode or explicit guest data (${missing.join(", ")})`;
    }
  }

  return null;
}

function validateNameArgs(args) {
  if (args.name || (args.first_name && args.last_name)) {
    return null;
  }
  return "Missing required argument: provide name or first_name and last_name";
}

function allowsEmptyRequiredValue(toolName, key) {
  return (
    (toolName === "hostkit_add_invoice" && key === "customer_id") ||
    (toolName === "hostkit_add_invoice_line" && key === "reason_code")
  );
}

function invoiceListProperties() {
  return {
    invoicing_nif: stringSchema("Invoicing VAT ID."),
    series: stringSchema("Document series."),
    id: numberOrStringSchema("Document ID."),
    customer_id: stringSchema("Customer ID."),
    date_start: numberOrStringSchema("Start date as Unix timestamp."),
    date_end: numberOrStringSchema("End date as Unix timestamp."),
  };
}

function invoiceDocumentRefProperties() {
  return {
    invoicing_nif: stringSchema("Invoicing VAT ID."),
    series: stringSchema("Document series. Defaults to the configured default series in Hostkit."),
    id: numberOrStringSchema("Document ID."),
    invoice_type: { type: "string", enum: ["FR", "FT"], description: "Invoice type. Defaults to FR in Hostkit." },
  };
}

function invoiceProperties() {
  return {
    invoicing_nif: stringSchema("Invoicing VAT ID."),
    series: stringSchema("Invoice series. Defaults to the configured default series in Hostkit."),
    invoice_type: { type: "string", enum: ["FR", "FT"], description: "Invoice type. Defaults to FR in Hostkit." },
    customer_id: stringSchema("Customer VAT/customer ID. Empty string creates final consumer."),
    name: stringSchema("Customer name."),
    country: stringSchema("Customer country ICAO code."),
    address: stringSchema("Customer address."),
    cp: stringSchema("Customer postal code."),
    city: stringSchema("Customer city."),
    rcode: stringSchema("Related reservation code."),
    comment: stringSchema("Invoice comment."),
    payment_method: stringSchema("Payment method. Defaults to TB in Hostkit."),
  };
}

function propertyProperties() {
  return {
    property_name: stringSchema("Property name."),
    address: stringSchema("Property address."),
    zip: stringSchema("Portuguese postal code, format 0000-000."),
    city: stringSchema("Property city."),
    latitude: numberOrStringSchema("Latitude."),
    longitude: numberOrStringSchema("Longitude."),
    default_checkin: numberOrStringSchema("Default check-in hour, 0-23."),
    default_checkout: numberOrStringSchema("Default check-out hour, 0-23."),
    license_number: numberOrStringSchema("Government license number."),
    license_type: { type: "string", enum: ["RNAL", "RNET", "RRAL"], description: "Government license type." },
    typology: { type: "string", enum: ["T0", "T1", "T2", "T3", "T4", "T5", "T6", "NA"], description: "Property typology." },
    siba_id: stringSchema("SIBA ID, 9 digits."),
    siba_order: numberOrStringSchema("SIBA establishment number."),
    siba_code: stringSchema("SIBA activation key, 12 digits."),
    invoicing_nif: stringSchema("Invoicing VAT ID."),
    invoicing_name: stringSchema("Invoicing name."),
    invoicing_email: stringSchema("Invoicing email."),
    invoicing_phone: stringSchema("Invoicing phone."),
    invoicing_address: stringSchema("Invoicing address."),
  };
}

function sibaGuestProperties() {
  return {
    name: stringSchema("Guest full name. Alternative to first_name and last_name where supported."),
    first_name: stringSchema("Guest first name."),
    last_name: stringSchema("Guest last name."),
    nationality: stringSchema("ICAO country code."),
    birthday: stringSchema("YYYY-MM-DD."),
    doc_id: stringSchema("Guest document number."),
    doc_type: stringSchema("P, ID/B, or O."),
    doc_country: stringSchema("ICAO country code."),
    arrival: stringSchema("YYYY-MM-DD."),
    departure: stringSchema("YYYY-MM-DD."),
    country_residence: stringSchema("ICAO country code."),
    city_residence: stringSchema("Guest city of residence."),
  };
}

function sibaGuestRequired() {
  return [
    "nationality",
    "birthday",
    "doc_id",
    "doc_type",
    "doc_country",
    "arrival",
    "departure",
    "country_residence",
    "city_residence",
  ];
}

function reservationWriteProperties() {
  return {
    rcode: stringSchema("Hostkit reservation code."),
    name: stringSchema("Guest full name. Alternative to first_name and last_name."),
    first_name: stringSchema("Guest first name."),
    last_name: stringSchema("Guest last name."),
    check_in: stringSchema("Arrival date/time, for example 2023-05-20 16:00."),
    check_out: stringSchema("Departure date/time, for example 2023-05-25 11:00."),
    pax: numberOrStringSchema("Number of guests."),
    email: stringSchema("Guest email."),
    phone: stringSchema("Guest phone."),
    received_amount: numberOrStringSchema("Received amount."),
    host_commission: numberOrStringSchema("Channel commission."),
    cleaning_fee: numberOrStringSchema("Cleaning fee."),
    extra_fees: numberOrStringSchema("Extra fees."),
    city_tax: numberOrStringSchema("City tax."),
    provider: stringSchema("Channel name."),
    reservation_date: stringSchema("Reservation date."),
    room: stringSchema("Room."),
    beds: stringSchema("Beds."),
    private_note: stringSchema("Private note."),
    service_notes: stringSchema("Service user notes."),
    vat_number: stringSchema("Invoice VAT number."),
    vat_name: stringSchema("Invoice VAT name."),
    flight: stringSchema("Flight number."),
    flight_time: stringSchema("Flight time."),
    arrival_by: stringSchema("Arrival transport."),
    block_sef: numberOrStringSchema("Set to 1 to block SIBA/SEF automation."),
    service_in: stringSchema("Service check-in field."),
    service_out: stringSchema("Service check-out field."),
    service_cleaning: stringSchema("Service cleaning field."),
    service_transfer_arr: stringSchema("Service arrival transfer field."),
    service_transfer_dep: stringSchema("Service departure transfer field."),
    service_laundry: stringSchema("Service laundry field."),
    create_payment: numberOrStringSchema("Set to 1 to create payment."),
  };
}
