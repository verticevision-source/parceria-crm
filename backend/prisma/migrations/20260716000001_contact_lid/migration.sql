-- Endereçamento LID do WhatsApp: alguns contatos só recebem mensagem no JID
-- "<id>@lid". Enviar pro número puro (@s.whatsapp.net) fica PENDING e nunca
-- entrega. Guardamos o LID vindo do webhook para usar no envio.
ALTER TABLE "contacts" ADD COLUMN "lid" TEXT;
