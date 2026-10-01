using Api.Authorization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var keycloak = builder.Configuration.GetSection("Keycloak");

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = keycloak["Authority"];
        options.Audience = keycloak["Audience"];
        options.RequireHttpsMetadata = keycloak.GetValue<bool>("RequireHttpsMetadata");
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            NameClaimType = "preferred_username",
        };
    });

builder.Services.AddTransient<IClaimsTransformation, KeycloakRoleClaimsTransformation>();

builder.Services.AddAuthorizationBuilder()
    .AddPolicy(SelectionGroups.SystemAdmin, p => p.RequireRole(SelectionGroups.SystemAdmin))
    .AddPolicy(SelectionGroups.SelectionManager, p => p.RequireRole(SelectionGroups.SelectionManager))
    .AddPolicy(SelectionGroups.SelectionOfficer, p => p.RequireRole(SelectionGroups.SelectionOfficer))
    .AddPolicy(SelectionGroups.CommitteeUser, p => p.RequireRole(SelectionGroups.CommitteeUser))
    // Cross-cutting tiers used by most feature endpoints instead of single-role checks.
    .AddPolicy(SelectionGroups.ManagementTier, p => p.RequireRole(
        SelectionGroups.SystemAdmin, SelectionGroups.SelectionManager))
    .AddPolicy(SelectionGroups.OperationsTier, p => p.RequireRole(
        SelectionGroups.SystemAdmin, SelectionGroups.SelectionManager, SelectionGroups.SelectionOfficer));

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy => policy
        .WithOrigins(builder.Configuration["Frontend:Origin"] ?? "http://localhost:3000")
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials());
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseCors("Frontend");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
