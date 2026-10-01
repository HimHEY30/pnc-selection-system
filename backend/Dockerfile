FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy project files first so `dotnet restore` is cached as its own layer
# and only re-runs when a .csproj actually changes.
COPY Backend.slnx .
COPY src/SharedKernel/SharedKernel.csproj src/SharedKernel/
COPY src/Modules/Identity/Identity.Domain/Identity.Domain.csproj src/Modules/Identity/Identity.Domain/
COPY src/Modules/Identity/Identity.Application/Identity.Application.csproj src/Modules/Identity/Identity.Application/
COPY src/Modules/Identity/Identity.Infrastructure/Identity.Infrastructure.csproj src/Modules/Identity/Identity.Infrastructure/
COPY src/Modules/Identity/Identity.Api/Identity.Api.csproj src/Modules/Identity/Identity.Api/
COPY src/Host/Host.csproj src/Host/
RUN dotnet restore src/Host/Host.csproj

COPY src/ src/
RUN dotnet publish src/Host/Host.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .

EXPOSE 8080
ENTRYPOINT ["dotnet", "Host.dll"]
