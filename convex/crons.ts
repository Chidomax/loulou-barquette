import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

// Chaque nuit : anonymise les commandes de plus de 30 jours, efface les positions de livreur oubliées et les compteurs anti-abus périmés.
crons.daily("confidentialite", { hourUTC: 0, minuteUTC: 30 }, internal.orders.anonymizeOld, {})

export default crons
