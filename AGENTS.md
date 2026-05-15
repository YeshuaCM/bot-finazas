# Code Review Rules - Bot Telegram Financiero

## Technology Stack
- **Language**: TypeScript
- **Bot Framework**: GrammY
- **Database**: Supabase (PostgreSQL)
- **API**: Express
- **Validation**: Zod

---

## TypeScript & General

### ✅ Required
- Tipado explícito en funciones y variables
- Interfaces para estructuras de datos
- Tipos de retorno en funciones
- `strict: true` en tsconfig

### ✅ Preferred
- Tipos de utilidad de TypeScript (`Partial`, `Record`, etc.)
- Generic types para funciones reutilizables
- Type guards para validación de tipos

---

## Architecture & Patterns

### ✅ Required
- Separación clara: `bot/`, `api/`, `services/`, `data/`, `config/`
- Repository pattern para acceso a datos
- Inyección de dependencias en servicios

### ✅ Preferred
- Clean Architecture (domain, application, infrastructure)
- Single Responsibility Principle en funciones
- Funciones puras cuando sea posible

---

## Bot (GrammY)

### ✅ Required
- Handlers registrados correctamente con `bot.on()`, `bot.command()`
- Middleware para autenticación y logging
- Manejo de errores con `bot.catch()` o try/catch

### ✅ Preferred
- Conversations para flujos interactivos
- Keyboard builders para UI consistente
- Composable handlers (separar lógica de ejecución)

---

## Database (Supabase)

### ✅ Required
- Consultas tipadas con inferencia de tipos de Supabase
- Manejo de errores para queries fallidas
- Validación de datos antes de insertar

### ✅ Preferred
- Prepared statements para queries frecuentes
- Uso de repository pattern para abstraer Supabase
- Transacciones cuando sea necesario (multi-insert)

---

## API (Express)

### ✅ Required
- Tipado de `Request` y `Response` de Express
- Validación de inputs con Zod en middleware
- Códigos de estado HTTP apropiados (200, 400, 404, 500)
- Headers de seguridad (Content-Type)

### ✅ Preferred
- Middleware de error global
- Request validation middleware
- Rate limiting en endpoints públicos

---

## Security

### ✅ Required
- No hardcoded secrets (usar variables de entorno)
- Validación de inputs del usuario
- Sanitización de queries SQL (usar parámetros)

### ✅ Prohibited
- Exponer claves de API en logs
- Insertar datos sin validación
- Depender de inputs no validados

---

## Error Handling

### ✅ Required
- Try/catch en operaciones asíncronas
- Mensajes de error descriptivos
- Logging de errores para debugging

### ✅ Preferred
- Custom error classes para errores de dominio
- Error middleware en Express
- Fallbacks apropiados en servicios

---

## Code Style

### ✅ Required
- Nombres descriptivos (snake_case para archivos, PascalCase para clases/interfaces)
- Una responsabilidad por función (máx 30 líneas si es posible)
- Comentar lógica de negocio compleja (no código obvio)

### ✅ Prohibited
- Funciones de más de 50 líneas sin justificación
- Código duplicado (refactorizar)
- Magic numbers (usar constantes)

---

## Testing (si aplica)

### ✅ Required
- Tests unitarios para funciones de dominio
- Mock de dependencias externas
- Cobertura de casos edge

---

## Review Checklist

1. **Types**: ¿Todas las funciones tienen tipos de retorno?
2. **Errors**: ¿Se manejan todos los errores posibles?
3. **Security**: ¿Validan inputs? ¿No exponen secrets?
4. **Architecture**: ¿Sigue la estructura de carpetas?
5. **Clean**: ¿Hay código duplicado o funciones demasiado largas?
6. **Testing**: ¿Los casos edge están cubiertos?

---

## Commands for Review

```bash
# Type check
npm run build

# Lint (si está configurado)
npm run lint

# Test
npm run test
```